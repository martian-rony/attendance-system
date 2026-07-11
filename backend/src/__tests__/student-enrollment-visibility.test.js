// Regression test for the "student enrolled but course missing from My Courses" bug.
//
// Root cause class: enrollment is stored in BOTH the Enrollment collection (the
// real source of truth) and a denormalized Course.students array. If that array
// is ever wiped/partially updated (e.g. a manual DB cleanup, a backfill that
// didn't run, or an older code path that wrote only one side), the student's
// real enrollment becomes invisible because getMyCourses/getCourses/getCourse
// read the array instead of Enrollment.
//
// This test simulates that drift (Enrollment present, Course.students emptied)
// and asserts the course STILL appears / is still authorized for the student.
import request from 'supertest';
import mongoose from 'mongoose';
import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';

let server;
let BASE;
let app;
let User;
let Course;
let mongo;

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  ${extra}`);
  }
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  const db = await import('../config/database.js');
  await db.connectDB();
  app = (await import('../app.js')).default;
  const { initializeSocket } = await import('../socket/handlers.js');
  User = (await import('../models/User.js')).default;
  Course = (await import('../models/Course.js')).default;
  server = http.createServer(app);
  initializeSocket(server);
  await new Promise((res) => server.listen(0, res));
  BASE = `http://localhost:${server.address().port}`;

  const mk = async (email, password, role, extra = {}) => {
    const u = new User({
      email,
      passwordHash: password, // pre('save') hashes it once
      role,
      isActive: true,
      firstName: role[0].toUpperCase(),
      lastName: role.slice(1),
      ...extra,
    });
    await u.save();
    return u;
  };
  await mk('admin@college.edu', 'Admin@1234', 'admin');
  await mk('faculty1@college.edu', 'Faculty@123', 'faculty', { department: 'Computer Science' });
  await mk('student1@college.edu', 'Student@123', 'student', { studentId: 'STU001' });
}, 60000);

afterAll(async () => {
  if (server) await new Promise((res) => server.close(res));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  console.log(
    `\n=== student-enrollment-visibility: ${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' FAILED'} (${pass} passed, ${fail} failed) ===`
  );
  if (fail > 0 && typeof process.exit === 'function') process.exitCode = 1;
});

const api = (token) => ({
  get: (p) => request(BASE).get(p).set('Authorization', token ? `Bearer ${token}` : ''),
  post: (p, body) =>
    request(BASE)
      .post(p)
      .set('Authorization', token ? `Bearer ${token}` : '')
      .send(body),
  del: (p) =>
    request(BASE)
      .delete(p)
      .set('Authorization', token ? `Bearer ${token}` : ''),
});

const login = async (email, password) => {
  const r = await api().post('/api/auth/login', { email, password });
  if (!r.body?.data?.user) throw new Error(`login failed ${email}: ${r.status}`);
  return { user: r.body.data.user, token: r.body.data.tokens.accessToken };
};

test('enrolled course shows in My Courses even if Course.students array is wiped', async () => {
  const admin = await login('admin@college.edu', 'Admin@1234');
  const faculty = await login('faculty1@college.edu', 'Faculty@123');
  const student = await login('student1@college.edu', 'Student@123');

  // Faculty-owned course the student will enroll in.
  const courseRes = await api(admin.token).post('/api/courses', {
    code: `VIS${Date.now().toString().slice(-4)}`,
    name: 'Visibility Test Course',
    department: 'Computer Science',
    program: 'btech',
    year: 1,
    semester: 1,
    credits: 3,
    academicYear: '2024-2025',
    faculty: faculty.user._id,
  });
  const courseId = courseRes.body.data?.course?._id;
  ok('course created', !!courseId, JSON.stringify(courseRes.body).slice(0, 120));

  // A second course the student is NOT enrolled in (must never appear).
  const otherRes = await api(admin.token).post('/api/courses', {
    code: `OTH${Date.now().toString().slice(-4)}`,
    name: 'Other Course (not enrolled)',
    department: 'Computer Science',
    program: 'btech',
    year: 1,
    semester: 1,
    credits: 3,
    academicYear: '2024-2025',
    faculty: faculty.user._id,
  });
  const otherId = otherRes.body.data?.course?._id;
  ok('other course created', !!otherId);

  // Enroll the student (creates an active Enrollment AND syncs Course.students).
  const enr = await api(admin.token).post(`/api/courses/${courseId}/enroll`, {
    studentIds: [student.user._id],
  });
  ok('enroll returns 200', enr.status === 200, `status ${enr.status}`);

  // SIMULATE THE BUG SCENARIO: someone wiped the denormalized Course.students
  // array (the data loss the user reported). The real Enrollment survives.
  await Course.findByIdAndUpdate(courseId, { $set: { students: [] } });
  const afterWipe = await Course.findById(courseId);
  ok(
    'Course.students is empty after wipe (drift reproduced)',
    !afterWipe.students || afterWipe.students.length === 0,
    `students=${JSON.stringify(afterWipe.students)}`
  );

  // My Courses MUST still show the enrolled course (reads Enrollment, not the array).
  const mine = await api(student.token).get('/api/courses/my-courses');
  ok('GET /my-courses -> 200', mine.status === 200, `status ${mine.status}`);
  const mineIds = (mine.body?.data?.courses || []).map((c) => c._id);
  ok(
    'enrolled course present in My Courses despite wiped array',
    mineIds.includes(courseId),
    `mineIds=${JSON.stringify(mineIds)}`
  );
  ok(
    'non-enrolled course NOT in My Courses',
    !mineIds.includes(otherId),
    `mineIds=${JSON.stringify(mineIds)}`
  );

  // The Courses list (role-filtered) must also scope correctly via Enrollment.
  const list = await api(student.token).get('/api/courses');
  ok('GET /courses -> 200', list.status === 200, `status ${list.status}`);
  const listIds = (list.body?.data?.courses || []).map((c) => c._id);
  ok('enrolled course in /courses list', listIds.includes(courseId));
  ok('non-enrolled course NOT in /courses list', !listIds.includes(otherId));

  // getCourse authorization must be enforced via Enrollment, not the array.
  const courseDetail = await api(student.token).get(`/api/courses/${courseId}`);
  ok('enrolled student CAN open the course (200)', courseDetail.status === 200, `status ${courseDetail.status}`);
  const otherDetail = await api(student.token).get(`/api/courses/${otherId}`);
  ok('non-enrolled student CANNOT open other course (403)', otherDetail.status === 403, `status ${otherDetail.status}`);

  // Dropping the enrollment must hide the course again (status-driven).
  const drop = await api(student.token).del(`/api/courses/${courseId}/enroll-self`);
  ok('unenroll-self -> 200', drop.status === 200, `status ${drop.status}`);
  const mineAfter = await api(student.token).get('/api/courses/my-courses');
  const mineAfterIds = (mineAfter.body?.data?.courses || []).map((c) => c._id);
  ok(
    'dropped course no longer in My Courses',
    !mineAfterIds.includes(courseId),
    `mineAfterIds=${JSON.stringify(mineAfterIds)}`
  );
}, 60000);
