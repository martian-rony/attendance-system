// Corrected production smoke test. Uses proper HH:MM time strings and the
// real route paths discovered in the codebase.
const https = require('https');
const BASE = 'https://attendance-system-u58r.onrender.com';
const pad = (n) => String(n).padStart(2, '0');
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + path);
    const opts = { method, hostname: u.hostname, path: u.pathname + u.search, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = https.request(opts, (res) => { let s=''; res.on('data',(d)=>s+=d); res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j=s}resolve({status:res.statusCode,body:j});}); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const login = async (e, pw) => { const { body } = await req('POST','/api/auth/login',{email:e,password:pw}); if(!body.success) throw new Error('login '+e+' '+JSON.stringify(body)); return body.data.tokens.accessToken; };
const log = (l, res) => { const b=res.body; console.log(`${l} -> HTTP ${res.status} | ${b.success?'OK':b.message}${b.data&&b.data._id?' id='+b.data._id:''}`); return b; };

(async () => {
  const admin = await login('admin@college.edu','Admin@1234');
  const fac = await login('faculty1@college.edu','Faculty@123');
  const stu = await login('student1@college.edu','Student@123');
  console.log('LOGIN 3 roles: OK');

  // admin course (reuse TEST101 if exists, else create)
  const cs = await req('GET','/api/courses?limit=50',null,admin);
  let course = cs.body.data.courses.find(c=>c.code==='TEST101');
  if (!course) { const nc = await req('POST','/api/courses',{code:'TEST101',name:'Smoke Test Course',credits:3,department:'Computer Science',semester:1,academicYear:'2025-2026',faculty:cs.body.data.courses[0].faculty? '' : '',geofenceRadius:200},admin); course = nc.body.data; }
  const cid = course._id || course.id;
  console.log('COURSE id=', cid);

  // faculty create session (local clock)
  const now = new Date();
  const sess = await req('POST','/api/sessions',{courseId:cid,title:'Smoke Session',date:localDate(),startTime:localTime(now),endTime:localTime(new Date(Date.now()+3600000)),room:'R1',building:'B1',location:{coordinates:[77.209,28.6139]},geofenceRadius:500},fac);
  const sid = (sess.body.data && (sess.body.data._id || (sess.body.data.session && sess.body.data.session._id)));
  log('FACULTY POST /sessions', sess);
  if (!sid) { console.log('ABORT: no session'); process.exit(1); }

  const start = await req('POST',`/api/sessions/${sid}/start`,{},fac);
  log('FACULTY POST /sessions/:id/start', start);

  const qr = await req('GET',`/api/sessions/${sid}/qr`,null,fac);
  log('FACULTY GET /sessions/:id/qr', qr);
  const token = qr.body.data && qr.body.data.qrCode && qr.body.data.qrCode.data;

  // student enroll-self
  const enroll = await req('POST',`/api/courses/${cid}/enroll-self`,{},stu);
  log('STUDENT POST /courses/:id/enroll-self', enroll);

  // student mark attendance inside geofence
  if (token) {
    const mark = await req('POST','/api/attendance/mark',{sessionId:sid,token,latitude:28.6139,longitude:77.209},stu);
    log('STUDENT POST /attendance/mark (inside geofence)', mark);
  } else console.log('MARK SKIPPED no token');

  // faculty attendance list
  const list = await req('GET',`/api/sessions/${sid}/attendance`,null,fac);
  log('FACULTY GET /sessions/:id/attendance', list);

  // student my-courses + my attendance
  const mc = await req('GET','/api/courses/my-courses',null,stu);
  log('STUDENT GET /courses/my-courses', mc);
  const sa = await req('GET','/api/attendance/student',null,stu);
  log('STUDENT GET /attendance/student', sa);

  // admin reports overview + audit-logs
  const ov = await req('GET','/api/reports/overview',null,admin);
  log('ADMIN GET /reports/overview', ov);
  const au = await req('GET','/api/reports/audit-logs?limit=5',null,admin);
  log('ADMIN GET /reports/audit-logs', au);

  console.log('\nSMOKE COMPLETE');
})().catch(e=>{console.error('SMOKE FAILED:',e.message);process.exit(1);});
