// Integration test for the QR / geolocation / attendance + Socket.io flow.
// Uses Node's built-in fetch (no axios) + socket.io-client. Mirrors the
// frontend flow: faculty starts a session, student scans the QR (sends the
// token + GPS), backend records attendance with geofence check, and a
// realtime 'attendance:marked' event fires to the session room.
//
// Usage: node src/scripts/integration-attendance.js   (server must be up)
const { io } = await import('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:5000';

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${extra}`);
  }
};
const post = (path, body, token) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify(body),
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(`HTTP ${r.status}`);
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return { status: r.status, data };
  });
const get = (path, token) =>
  fetch(BASE + path, { headers: apiHeaders(token) }).then(async (r) => ({
    status: r.status,
    data: await r.json().catch(() => ({})),
  }));
const apiHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

async function login(email, password) {
  const r = await post('/api/auth/login', { email, password });
  if (!r.data?.data?.user) {
    throw new Error(
      `login failed for ${email}: ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`
    );
  }
  return { user: r.data.data.user, token: r.data.data.tokens.accessToken };
}

async function main() {
  const admin = await login('admin@college.edu', 'Admin@1234');
  const faculty = await login('faculty1@college.edu', 'Faculty@123');
  const student1 = await login('student1@college.edu', 'Student@123');
  const student2 = await login('student2@college.edu', 'Student@123');
  ok('all four logins succeed', admin.user && faculty.user && student1.user && student2.user);

  // Admin creates a course, enrolls the two students
  const courseRes = await post(
    '/api/courses',
    {
      code: `TST${Date.now().toString().slice(-4)}`,
      name: 'Integration Test Course',
      department: 'Computer Science',
      program: 'btech',
      year: 1,
      semester: 1,
      credits: 3,
      academicYear: '2024-2025',
      faculty: faculty.user._id,
    },
    admin.token
  );
  if (!courseRes.data.data) {
    console.log('COURSE CREATE FAILED:', courseRes.status, JSON.stringify(courseRes.data));
    process.exit(1);
  }
  const courseBody = courseRes.data.data.course || courseRes.data.data;
  const courseId = courseBody?._id;
  ok('admin creates course', !!courseId, JSON.stringify(courseRes.data).slice(0, 120));

  await post(
    `/api/courses/${courseId}/enroll`,
    { studentIds: [student1.user._id, student2.user._id] },
    admin.token
  );
  ok('students enrolled', true);

  // Faculty creates + starts a session with geofence
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  // Local Y-M-D (not toISOString(), which is UTC and can drift a day vs the
  // local startTime, pushing the session ~24h into the past and closing the window).
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const SESS_LON = 77.209,
    SESS_LAT = 28.6139;

  const sessRes = await post(
    '/api/sessions',
    {
      courseId,
      title: 'Live Attendance Session',
      date: localDate,
      startTime: hhmm(start),
      endTime: hhmm(end),
      room: 'A-101',
      building: 'Main Block',
      location: { type: 'Point', coordinates: [SESS_LON, SESS_LAT] },
      geofenceRadius: 100,
      settings: { requireGeolocation: true, lateThreshold: 15, allowLateEntry: true },
      attendanceWindow: { openBefore: 10, closeAfter: 30 },
    },
    faculty.token
  );
  if (!sessRes.data.data) {
    console.log('SESSION CREATE FAILED:', sessRes.status, JSON.stringify(sessRes.data));
    process.exit(1);
  }
  const sessionBody = sessRes.data.data.session || sessRes.data.data;
  const sessionId = sessionBody?._id;
  ok('faculty creates session', !!sessionId, JSON.stringify(sessRes.data).slice(0, 120));

  const startRes = await post(`/api/sessions/${sessionId}/start`, {}, faculty.token);
  ok('faculty starts session', startRes.data.success === true);
  const qrDataStr = startRes.data.data.qrCode?.data;
  ok('session has QR payload', !!qrDataStr);
  const qrToken = JSON.parse(qrDataStr).token;
  ok('QR token extractable', !!qrToken);

  // Socket.io: faculty joins session room, listens for live marks
  const socket = io(BASE, { auth: { token: faculty.token } });
  await new Promise((res, rej) => {
    socket.on('connect', () => {
      socket.emit('join', `session:${sessionId}`);
      res();
    });
    socket.on('connect_error', rej);
    setTimeout(() => rej(new Error('socket connect timeout')), 5000);
  });
  ok('socket connected', socket.connected);

  // Student1 marks INSIDE geofence -> success + live event
  const nowIso = () => new Date().toISOString();
  const insideGeo = {
    coordinates: [SESS_LON + 0.0001, SESS_LAT],
    accuracy: 10,
    timestamp: nowIso(),
  };
  const livePromise = new Promise((res) => socket.once('attendance:marked', res));
  const markRes = await post(
    '/api/attendance/mark',
    { sessionId, qrToken, geolocation: insideGeo, deviceInfo: { userAgent: 'integration-test' } },
    student1.token
  );
  ok('student marks (inside geofence) -> 201', markRes.status === 201, `status ${markRes.status}`);
  ok(
    'recorded status is present',
    markRes.data?.data?.attendance?.status === 'present',
    `got ${markRes.data?.data?.attendance?.status}`
  );

  const evt = await Promise.race([
    livePromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('no live event')), 5000)),
  ]).catch((e) => {
    console.log('   (live event wait:', e.message, ')');
    return null;
  });
  ok(
    'realtime attendance:marked fired',
    !!evt && evt.studentId === student1.user._id,
    JSON.stringify(evt)
  );

  // Double mark -> 400
  let doubleErr = 0;
  try {
    await post(
      '/api/attendance/mark',
      { sessionId, qrToken, geolocation: insideGeo },
      student1.token
    );
  } catch (e) {
    doubleErr = e.status;
    if (doubleErr !== 400) console.log('  double-mark err:', e.status, JSON.stringify(e.data));
  }
  ok('double mark rejected (400)', doubleErr === 400, `status ${doubleErr}`);

  // Outside geofence -> 400
  let farErr = 0,
    farMsg = '';
  const farGeo = { coordinates: [SESS_LON + 0.02, SESS_LAT], accuracy: 10, timestamp: nowIso() };
  try {
    await post('/api/attendance/mark', { sessionId, qrToken, geolocation: farGeo }, student1.token);
  } catch (e) {
    farErr = e.status;
    farMsg = e.data?.message;
    if (farErr !== 400) console.log('  far-mark err:', farErr, JSON.stringify(e.data));
  }
  ok('outside-geofence mark rejected (400)', farErr === 400, `status ${farErr} msg ${farMsg}`);

  // Bad QR token -> 400
  let badErr = 0;
  try {
    await post(
      '/api/attendance/mark',
      { sessionId, qrToken: 'deadbeef', geolocation: insideGeo },
      student1.token
    );
  } catch (e) {
    badErr = e.status;
    if (badErr !== 400) console.log('  bad-token err:', badErr, JSON.stringify(e.data));
  }
  ok('bad QR token rejected (400)', badErr === 400, `status ${badErr}`);

  // Student2 marks -> 2nd live event
  const livePromise2 = new Promise((res) => socket.once('attendance:marked', res));
  const mark2 = await post(
    '/api/attendance/mark',
    { sessionId, qrToken, geolocation: insideGeo },
    student2.token
  );
  ok('student2 marks -> 201', mark2.status === 201);
  const evt2 = await Promise.race([
    livePromise2,
    new Promise((_, rej) => setTimeout(() => rej(new Error('no 2nd live event')), 5000)),
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
  const listRes = await get(`/api/attendance/session/${sessionId}`, faculty.token);
  const count = listRes.data?.data?.attendance?.length || 0;
  ok('faculty attendance list has 2 records', count === 2, `count ${count}`);

  socket.disconnect();
  console.log(
    `\n=== ${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'} (${pass} passed, ${fail} failed) ===`
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('INTEGRATION TEST ERROR:', e?.data || e.message);
  process.exit(1);
});
