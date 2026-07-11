// Full-stack integration test: QR / geolocation / attendance + Socket.io flow.
// Boots the Express app + Socket.io in-process against an in-memory MongoDB.
// Mirrors how the frontend drives attendance: admin creates a course, faculty
// starts a session (QR issued), student scans the QR (token + GPS), backend
// records attendance with a geofence check, and a realtime 'attendance:marked'
// event fires to the faculty's session room.
import request from 'supertest';
import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import http from 'http';
import { MongoMemoryServer } from 'mongodb-memory-server';
let server;
let BASE;
let app;
let User;
let mongo;

const api = (token) => ({
  get: (p) =>
    request(BASE)
      .get(p)
      .set('Authorization', token ? `Bearer ${token}` : ''),
  post: (p, body) =>
    request(BASE)
      .post(p)
      .set('Authorization', token ? `Bearer ${token}` : '')
      .send(body),
});

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
  // Dynamic imports AFTER env is set so app/config read correct secrets.
  const db = await import('../config/database.js');
  await db.connectDB();
  app = (await import('../app.js')).default;
  const { initializeSocket } = await import('../socket/handlers.js');
  User = (await import('../models/User.js')).default;
  server = http.createServer(app);
  initializeSocket(server);
  await new Promise((res) => server.listen(0, res));
  BASE = `http://localhost:${server.address().port}`;

  // Seed the four accounts directly (bypassing registration restrictions).
  const mk = async (email, password, role, extra = {}) => {
    // Set plain `passwordHash`; the model's pre('save') hook hashes it once.
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
  await mk('student2@college.edu', 'Student@123', 'student', { studentId: 'STU002' });
}, 60000);

afterAll(async () => {
  if (server) await new Promise((res) => server.close(res));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const login = async (email, password) => {
  const r = await api().post('/api/auth/login', { email, password });
  if (!r.body?.data?.user) throw new Error(`login failed ${email}: ${r.status}`);
  return { user: r.body.data.user, token: r.body.data.tokens.accessToken };
};

test('full attendance flow: QR + geolocation + Socket.io', async () => {
  const admin = await login('admin@college.edu', 'Admin@1234');
  const faculty = await login('faculty1@college.edu', 'Faculty@123');
  const student1 = await login('student1@college.edu', 'Student@123');
  const student2 = await login('student2@college.edu', 'Student@123');
  ok('all four logins succeed', admin.user && faculty.user && student1.user && student2.user);

  // Admin creates a course
  const courseRes = await api(admin.token).post('/api/courses', {
    code: `TST${Date.now().toString().slice(-4)}`,
    name: 'Integration Test Course',
    department: 'Computer Science',
    program: 'btech',
    year: 1,
    semester: 1,
    credits: 3,
    academicYear: '2024-2025',
    faculty: faculty.user._id,
  });
  const courseId = courseRes.body.data?.course?._id;
  ok('admin creates course', !!courseId, JSON.stringify(courseRes.body).slice(0, 120));

  await api(admin.token).post(`/api/courses/${courseId}/enroll`, {
    studentIds: [student1.user._id, student2.user._id],
  });
  ok('students enrolled', true);

  // Faculty creates + starts a session with geofence
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const SESS_LON = 77.209,
    SESS_LAT = 28.6139;
  const sessRes = await api(faculty.token).post('/api/sessions', {
    courseId,
    title: 'Live Attendance Session',
    date: now.toISOString().slice(0, 10),
    startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
    room: 'A-101',
    location: { type: 'Point', coordinates: [SESS_LON, SESS_LAT] },
    geofenceRadius: 100,
    settings: { requireGeolocation: true, lateThreshold: 15, allowLateEntry: true },
    attendanceWindow: { openBefore: 10, closeAfter: 30 },
  });
  const sessionId = sessRes.body.data?.session?._id;
  ok('faculty creates session', !!sessionId, JSON.stringify(sessRes.body).slice(0, 120));

  const startRes = await api(faculty.token).post(`/api/sessions/${sessionId}/start`, {});
  ok('faculty starts session', startRes.body.success === true);
  const qrToken = JSON.parse(startRes.body.data.qrCode.data).token;
  ok('QR token extractable', !!qrToken);

  // Faculty socket joins session room and listens for live marks
  const socket = io(BASE, { auth: { token: faculty.token } });
  await new Promise((res, rej) => {
    socket.on('connect', () => {
      socket.emit('join', `session:${sessionId}`);
      res();
    });
    socket.on('connect_error', rej);
    setTimeout(() => rej(new Error('socket connect timeout')), 8000);
  });
  ok('socket connected', socket.connected);

  const iso = () => new Date().toISOString();
  const insideGeo = { coordinates: [SESS_LON + 0.0001, SESS_LAT], accuracy: 10, timestamp: iso() };

  // Student1 marks INSIDE geofence -> 201 + live event
  const livePromise = new Promise((res) => socket.once('attendance:marked', res));
  const markRes = await api(student1.token).post('/api/attendance/mark', {
    sessionId,
    qrToken,
    geolocation: insideGeo,
    deviceInfo: { userAgent: 'test' },
  });
  ok('student marks (inside geofence) -> 201', markRes.status === 201, `status ${markRes.status}`);
  ok(
    'recorded status is present',
    markRes.body?.data?.attendance?.status === 'present',
    `got ${markRes.body?.data?.attendance?.status}`
  );

  const evt = await Promise.race([
    livePromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('no live event')), 6000)),
  ]).catch((e) => {
    console.log('   (live event:', e.message, ')');
    return null;
  });
  ok(
    'realtime attendance:marked fired',
    !!evt && evt.studentId === student1.user._id,
    JSON.stringify(evt)
  );

  // Double mark -> 400
  const doubleRes = await api(student1.token).post('/api/attendance/mark', {
    sessionId,
    qrToken,
    geolocation: insideGeo,
  });
  ok('double mark rejected (400)', doubleRes.status === 400, `status ${doubleRes.status}`);

  // Outside geofence -> 400
  const farGeo = { coordinates: [SESS_LON + 0.02, SESS_LAT], accuracy: 10, timestamp: iso() };
  const farRes = await api(student1.token).post('/api/attendance/mark', {
    sessionId,
    qrToken,
    geolocation: farGeo,
  });
  ok(
    'outside-geofence mark rejected (400)',
    farRes.status === 400,
    `status ${farRes.status} msg ${farRes.body?.message}`
  );

  // Bad QR token -> 400
  const badRes = await api(student1.token).post('/api/attendance/mark', {
    sessionId,
    qrToken: 'deadbeef',
    geolocation: insideGeo,
  });
  ok('bad QR token rejected (400)', badRes.status === 400, `status ${badRes.status}`);

  // Student2 marks -> 2nd live event
  const livePromise2 = new Promise((res) => socket.once('attendance:marked', res));
  const mark2 = await api(student2.token).post('/api/attendance/mark', {
    sessionId,
    qrToken,
    geolocation: insideGeo,
  });
  ok('student2 marks -> 201', mark2.status === 201);
  const evt2 = await Promise.race([
    livePromise2,
    new Promise((_, rej) => setTimeout(() => rej(new Error('no 2nd live event')), 6000)),
  ]).catch((e) => {
    console.log('   (2nd live event:', e.message, ')');
    return null;
  });
  ok(
    '2nd realtime attendance:marked fired',
    !!evt2 && evt2.studentId === student2.user._id,
    JSON.stringify(evt2)
  );

  // Faculty sees 2 records
  const listRes = await api(faculty.token).get(`/api/attendance/session/${sessionId}`);
  const count = listRes.body?.data?.attendance?.length || 0;
  ok('faculty attendance list has 2 records', count === 2, `count ${count}`);

  socket.disconnect();
}, 60000);

test('auth + RBAC smoke', async () => {
  const noAuth = await request(BASE).get('/api/courses');
  ok('no-auth /courses -> 401', noAuth.status === 401, `status ${noAuth.status}`);

  const student = await login('student1@college.edu', 'Student@123');
  const forbidden = await request(BASE)
    .get('/api/users')
    .set('Authorization', `Bearer ${student.token}`);
  ok(
    'student GET /api/users -> 403 (RBAC)',
    forbidden.status === 403,
    `status ${forbidden.status}`
  );

  const bad = await request(BASE).post('/api/auth/login').send({ email: 'admin@college.edu' });
  ok('login missing password -> 400', bad.status === 400, `status ${bad.status}`);
}, 30000);

test('admin provisions user without losing their own session', async () => {
  // Regression: POST /auth/register by an authenticated admin must NOT clobber
  // the admin's cookies/tokens (the old bug logged the admin out as the new user).
  const admin = await login('admin@college.edu', 'Admin@1234');

  // Capture the admin's cookie jar by using an agent, then provision a user.
  const agent = request.agent(BASE);
  await agent
    .post('/api/auth/login')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ email: 'admin@college.edu', password: 'Admin@1234' });

  const email = `prov+${Date.now()}@college.edu`;
  const res = await agent
    .post('/api/auth/register')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ email, password: 'Student@123', firstName: 'Pro', lastName: 'Vision', role: 'student' });

  ok('admin provision returns 201', res.status === 201, `status ${res.status}`);
  ok('created user has the requested role', res.body?.data?.user?.role === 'student');
  // The provisioning response must NOT hand back a fresh token pair (which is
  // what would overwrite the admin's session in the browser).
  ok('no token pair issued to admin on provision', !res.body?.data?.tokens, JSON.stringify(Object.keys(res.body?.data || {})));

  // Admin session still works: same admin can still read users (admin-only).
  const check = await agent.get('/api/users').set('Authorization', `Bearer ${admin.token}`);
  ok('admin still authorized after provisioning', check.status === 200, `status ${check.status}`);
}, 30000);

test('admin receives session:created via socket on session creation', async () => {
  // Regression for the "manual refresh" fix: when faculty creates a session,
  // the backend must emit `session:created` to the `role:admin` room so the
  // admin view refreshes without a manual reload.
  const admin = await login('admin@college.edu', 'Admin@1234');
  const faculty = await login('faculty1@college.edu', 'Faculty@123');

  // Admin subscribes to the role:admin room.
  const adminSocket = io(BASE, { auth: { token: admin.token } });
  const evtPromise = new Promise((res, rej) => {
    adminSocket.on('session:created', res);
    setTimeout(() => rej(new Error('no session:created event')), 6000);
  });
  await new Promise((res) => adminSocket.on('connect', res));

  // Need a course the faculty owns. Recreate the one from the full flow.
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const courseRes = await api(admin.token).post('/api/courses', {
    code: `RTL${Date.now().toString().slice(-4)}`,
    name: 'Realtime Test Course',
    department: 'Computer Science',
    program: 'btech',
    year: 1,
    semester: 1,
    credits: 3,
    academicYear: '2024-2025',
    faculty: faculty.user._id,
  });
  const courseId = courseRes.body.data?.course?._id;
  ok('realtime test course created', !!courseId, JSON.stringify(courseRes.body).slice(0, 100));

  const start = new Date(now.getTime() - 1 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sessRes = await api(faculty.token).post('/api/sessions', {
    courseId,
    title: 'Realtime Session',
    date: localDate,
    startTime: hhmm(start),
    endTime: hhmm(end),
    room: 'A-101',
    location: { type: 'Point', coordinates: [77.209, 28.6139] },
    geofenceRadius: 100,
    settings: { requireGeolocation: true, lateThreshold: 15, allowLateEntry: true },
    attendanceWindow: { openBefore: 10, closeAfter: 30 },
  });
  ok('faculty creates session for realtime test', sessRes.status === 201, `status ${sessRes.status}`);

  const evt = await evtPromise.catch((e) => ({ error: e.message }));
  ok('admin received session:created event', !!evt?.sessionId, JSON.stringify(evt));
  adminSocket.disconnect();
}, 30000);

test('admin creates user via /api/users without losing session', async () => {
  // Regression: the admin "Add User" modal posts to POST /api/users (the
  // admin-guarded endpoint), NOT the public /auth/register page. Confirm it
  // returns 201 + the user, and does NOT clobber the admin's session.
  const admin = await login('admin@college.edu', 'Admin@1234');
  const agent = request.agent(BASE);
  await agent
    .post('/api/auth/login')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ email: 'admin@college.edu', password: 'Admin@1234' });

  const email = `apiusr+${Date.now()}@college.edu`;
  const res = await agent
    .post('/api/users')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ email, password: 'Student@123', firstName: 'Api', lastName: 'User', role: 'student' });

  ok('admin POST /api/users returns 201', res.status === 201, `status ${res.status}`);
  ok('created user role is student', res.body?.data?.user?.role === 'student');
  ok('no token pair issued', !res.body?.data?.tokens, JSON.stringify(Object.keys(res.body?.data || {})));

  const check = await agent.get('/api/users').set('Authorization', `Bearer ${admin.token}`);
  ok('admin still authorized after POST /api/users', check.status === 200, `status ${check.status}`);
}, 30000);

test('admin receives session:started via socket on session start', async () => {
  // Regression: startSession must emit `session:started` to role:admin (not just
  // the course room), so the admin Sessions list refreshes when a session starts.
  const admin = await login('admin@college.edu', 'Admin@1234');
  const faculty = await login('faculty1@college.edu', 'Faculty@123');

  const adminSocket = io(BASE, { auth: { token: admin.token } });
  const evtPromise = new Promise((res, rej) => {
    adminSocket.on('session:started', res);
    setTimeout(() => rej(new Error('no session:started event')), 6000);
  });
  await new Promise((res) => adminSocket.on('connect', res));

  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const courseRes = await api(admin.token).post('/api/courses', {
    code: `STRT${Date.now().toString().slice(-4)}`,
    name: 'Start Event Test Course',
    department: 'Computer Science',
    program: 'btech',
    year: 1,
    semester: 1,
    credits: 3,
    academicYear: '2024-2025',
    faculty: faculty.user._id,
  });
  const courseId = courseRes.body.data?.course?._id;
  const start = new Date(now.getTime() - 1 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sessRes = await api(faculty.token).post('/api/sessions', {
    courseId,
    title: 'Start Event Session',
    date: localDate,
    startTime: hhmm(start),
    endTime: hhmm(end),
    room: 'A-101',
    location: { type: 'Point', coordinates: [77.209, 28.6139] },
    geofenceRadius: 100,
    settings: { requireGeolocation: true, lateThreshold: 15, allowLateEntry: true },
    attendanceWindow: { openBefore: 10, closeAfter: 30 },
  });
  const sessionId = sessRes.body.data?.session?._id;
  ok('session created for start-event test', !!sessionId, `status ${sessRes.status}`);

  const startRes = await api(faculty.token).post(`/api/sessions/${sessionId}/start`);
  ok('faculty starts session', startRes.status === 200, `status ${startRes.status}`);

  const evt = await evtPromise.catch((e) => ({ error: e.message }));
  ok('admin received session:started event', !!evt?.sessionId, JSON.stringify(evt));
  adminSocket.disconnect();
}, 30000);

afterAll(() => {
  console.log(
    `\n=== integration suite: ${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' FAILED'} (${pass} passed, ${fail} failed) ===`
  );
  if (fail > 0 && typeof process.exit === 'function') process.exitCode = 1;
});
