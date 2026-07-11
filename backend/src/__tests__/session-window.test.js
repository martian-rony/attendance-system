// Focused unit test for the attendance-window virtuals on the Session model.
// Verifies the fix for: "attendance window closed even when inside geofence
// and within class time" — the window must stay open through the class end,
// not close at start + closeAfter minutes.
//
// This test only needs a live Mongo (in-memory) and the Session model; it does
// NOT touch User creation, so it runs independently of the unrelated
// passwordHash harness bug in integration.test.js.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;
let Session;

const mkSession = (date, startTime, endTime, closeAfter) => {
  const s = new Session({
    course: new mongoose.Types.ObjectId(),
    faculty: new mongoose.Types.ObjectId(),
    title: 'Window Test',
    date,
    startTime,
    endTime,
    attendanceWindow: { openBefore: 10, closeAfter },
  });
  return s;
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Session = (await import('../models/Session.js')).default;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  ${extra}`);
  }
};

test('session window stays open through the class end (long class)', () => {
  const date = new Date();
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
  // 10:00-11:30 class, closeAfter 30 -> old bug closed at 10:30.
  const s = mkSession(ymd, '10:00', '11:30', 30);

  const open = s.windowOpenTime;
  const close = s.windowCloseTime;
  ok('opens 10 min before start (09:50)', open.getHours() === 9 && open.getMinutes() === 50);
  ok('closes at class end (11:30), not 10:30', close.getHours() === 11 && close.getMinutes() === 30);

  // Mark at 11:20: inside class, 80 min after start -> must be within window.
  const markAt = new Date(ymd + 'T11:20:00');
  ok(
    'student at 11:20 is within window (FIXED)',
    markAt >= open && markAt <= close,
    `open=${open} close=${close} mark=${markAt}`
  );
});

test('short class: closeAfter wins when longer than class', () => {
  const date = new Date();
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
  // 10:00-10:20 class, closeAfter 30 -> closeAfter (10:30) is the later time.
  const s = mkSession(ymd, '10:00', '10:20', 30);
  const close = s.windowCloseTime;
  ok('closes at closeAfter (10:30) when class is shorter', close.getHours() === 10 && close.getMinutes() === 30);
});

test('default closeAfter (30) still opens through class end on long classes', () => {
  const date = new Date();
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
  const s = mkSession(ymd, '09:00', '12:00', 30); // no explicit closeAfter beyond default
  const close = s.windowCloseTime;
  ok('long default-class closes at 12:00', close.getHours() === 12 && close.getMinutes() === 0);
});

afterAll(() => {
  console.log(`\n=== session-window suite: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
});
