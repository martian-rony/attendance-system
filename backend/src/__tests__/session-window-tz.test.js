// Regression test for the "Attendance is closed" timezone bug.
//
// Root cause class (Pitfall 16): the faculty frontend submits the session's
// date/startTime as the user's LOCAL wall-clock (e.g. IST "20:48"), but the
// old Session.sessionDateTime virtual re-interpreted that string using the
// SERVER's timezone (UTC). The window therefore opened ~5.5h away from the
// user's real "now", so a session created "now" was never within its window
// and marking attendance failed with "Attendance window is closed".
//
// Fix: the client now sends absolute UTC instants (startDateTime/endDateTime)
// and sessionDateTime returns those directly, making the window timezone-stable.
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
      passwordHash: password,
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
    `\n=== session-window-tz: ${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' FAILED'} (${pass} passed, ${fail} failed) ===`
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
  del: (p) => request(BASE).delete(p).set('Authorization', token ? `Bearer ${token}` : ''),
});

const login = async (email, password) => {
  const r = await api().post('/api/auth/login').send({ email, password });
  if (!r.body?.data?.user) throw new Error(`login failed ${email}: ${r.status}`);
  return { user: r.body.data.user, token: r.body.data.tokens.accessToken };
};

test('session created "now" is within window and markable across timezones', async () => {
  const admin = await login('admin@college.edu', 'Admin@1234');
  const faculty = await login('faculty1@college.edu', 'Faculty@123');
  const student = await login('student1@college.edu', 'Student@123');

  const courseRes = await api(admin.token).post('/api/courses').send({
    code: `TZ${Date.now().toString().slice(-4)}`,
    name: 'Timezone Window Course',
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

  // Faculty is in IST; simulate the client sending LOCAL wall-clock strings
  // plus the absolute UTC instants the fixed frontend computes.
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const pad = (n) => String(n).padStart(2, '0');
  const localStart = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const localEnd = `${pad(later.getHours())}:${pad(later.getMinutes())}`;
  // Absolute UTC instants (what the fixed frontend sends).
  const startDateTime = now.toISOString();
  const endDateTime = later.toISOString();

  const sessRes = await api(faculty.token)
    .post('/api/sessions')
    .send({
      courseId,
      title: 'TZ Session',
      date: localDate,
      startTime: localStart,
      endTime: localEnd,
      startDateTime,
      endDateTime,
      room: 'R1',
      building: 'B1',
      location: { coordinates: [77.209, 28.6139] },
      geofenceRadius: 500,
    });
  ok('session created', sessRes.status === 201, `status=${sessRes.status} ${JSON.stringify(sessRes.body).slice(0, 150)}`);
  const sessionId = sessRes.body.data?.session?._id;
  ok('session id present', !!sessionId);

  const started = await api(faculty.token).post(`/api/sessions/${sessionId}/start`).send({});
  ok('session started', started.status === 200, `status=${started.status}`);

  // The window must be open right now (server may be UTC; instant is absolute).
  const got = await api(faculty.token).get(`/api/sessions/${sessionId}`);
  const s = got.body.data?.session;
  ok('session fetchable', got.status === 200 && !!s, `status=${got.status}`);
  ok('isWithinWindow true', s?.isWithinWindow === true, `isWithinWindow=${s?.isWithinWindow} sessionDateTime=${s?.sessionDateTime}`);

  // Student enrolls and marks attendance inside the geofence.
  const enroll = await api(student.token).post(`/api/courses/${courseId}/enroll-self`).send({});
  ok('student enrolled', enroll.status === 201, `status=${enroll.status}`);

  const qr = await api(faculty.token).get(`/api/sessions/${sessionId}/qr`).send();
  const qd = qr.body.data?.qrCode;
  let token;
  try {
    const inner = typeof qd === 'string' ? qd : qd?.data;
    const parsed = JSON.parse(inner);
    token = parsed?.token;
  } catch (e) {
    token = undefined;
  }
  ok('qr token present', !!token, `status=${qr.status} qrBody=${JSON.stringify(qr.body).slice(0, 200)}`);

  const mark = await api(student.token).post('/api/attendance/mark').send({
    sessionId,
    qrToken: token,
    geolocation: { coordinates: [77.209, 28.6139] },
  });
  ok('attendance marked (not "window closed")', mark.status === 200 || mark.status === 201, `status=${mark.status} msg=${mark.body?.message}`);
  ok('mark not rejected as closed', mark.body?.message !== 'Attendance window is closed', `msg=${mark.body?.message}`);
}, 60000);

test('legacy session without startDateTime still computes a window (no crash)', async () => {
  const admin = await login('admin@college.edu', 'Admin@1234');
  const faculty = await login('faculty1@college.edu', 'Faculty@123');
  const courseRes = await api(admin.token).post('/api/courses').send({
    code: `LEG${Date.now().toString().slice(-4)}`,
    name: 'Legacy Course',
    department: 'Computer Science',
    program: 'btech',
    year: 1,
    semester: 1,
    credits: 3,
    academicYear: '2024-2025',
    faculty: faculty.user._id,
  });
  const courseId = courseRes.body.data?.course?._id;
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sessRes = await api(faculty.token).post('/api/sessions').send({
    courseId,
    title: 'Legacy Session',
    date: localDate,
    startTime: '09:00',
    endTime: '10:00',
    room: 'R1',
    location: { coordinates: [77.209, 28.6139] },
    geofenceRadius: 500,
  });
  ok('legacy session created', sessRes.status === 201, `status=${sessRes.status}`);
  const got = await api(faculty.token).get(`/api/sessions/${sessRes.body.data.session._id}`);
  ok('legacy session fetchable + window computed', got.status === 200 && typeof got.body.data?.session?.isWithinWindow === 'boolean', `status=${got.status}`);
}, 60000);
