const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { notify } = require('../services/notifications');
function staff(req,res,next){if(!['admin','teacher'].includes(req.user.role))return res.status(403).json({error:'Teacher or admin account required'});next();}

function localParts(date = new Date()) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).reduce((o,p) => (o[p.type]=p.value,o), {}); return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, display: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour:'2-digit', minute:'2-digit' }).format(date) }; }
function distance(a,b,c,d) { const r = 6371000, rad = x => x * Math.PI / 180; const x=rad(c-a), y=rad(d-b); return 2*r*Math.asin(Math.sqrt(Math.sin(x/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2)); }
function checkPolicy(db, body, qr = false) {
  const settings = Object.fromEntries(db.prepare('SELECT setting_key, setting_value FROM app_settings').all().map(x => [x.setting_key,x.setting_value]));
  const now=localParts();
  if (qr && settings.qr_enabled === '0') return 'QR attendance is disabled'; const qrDate = value => value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(value + ':00+08:00').getTime() : new Date(value).getTime(); if (qr && settings.qr_start && qrDate(settings.qr_start) > Date.now()) return 'QR attendance has not started yet';
  if (qr && settings.qr_end && qrDate(settings.qr_end) < Date.now()) return 'QR attendance period has expired';
  if (settings.gps_enabled === '1') {
    const lat=Number(body.latitude), lon=Number(body.longitude), schoolLat=Number(settings.school_latitude), schoolLon=Number(settings.school_longitude);
    if (body.latitude === undefined || body.longitude === undefined || !settings.school_latitude || !settings.school_longitude || ![lat,lon,schoolLat,schoolLon].every(Number.isFinite)) return 'GPS attendance is enabled but a location is unavailable or the school location is not configured';
    if (distance(lat,lon,schoolLat,schoolLon) > (Number(settings.geofence_radius_m)||100)) return 'You are outside the allowed attendance area';
  }
  return null;
}
function record(db, student, who, location) {
  const now=localParts(); const existing=db.prepare('SELECT * FROM attendance WHERE student_id = ? AND date = ?').get(student.id,now.date);
  if(existing) return {duplicate:true, student:student.full_name, time_in:existing.time_in, status:existing.status};
  const settings=Object.fromEntries(db.prepare('SELECT setting_key, setting_value FROM app_settings').all().map(x=>[x.setting_key,x.setting_value]));
  const status=(settings.late_after && now.time > settings.late_after) ? 'late' : 'present';
  db.prepare('INSERT INTO attendance (student_id,date,time_in,status,recorded_by,latitude,longitude) VALUES (?,?,?,?,?,?,?)').run(student.id,now.date,now.display,status,who,location.latitude||null,location.longitude||null);
  if(status==='late') notify(db, student, 'late', `Attendance notice: ${student.full_name} arrived late at ${now.display} on ${now.date}.`);
  return {student:student.full_name,time_in:now.display,date:now.date,status};
}
router.post('/scan', auth, staff, (req,res) => {
  const db=req.app.get('db'); const policy=checkPolicy(db,req.body,true); if(policy) return res.status(403).json({error:policy});
  const code=req.body.qr_code||''; const student=db.prepare('SELECT * FROM students WHERE qr_code = ? OR full_name = ?').get(code,code);
  if(!student) return res.status(404).json({error:'Student not found'});
  const result=record(db,student,req.user.username,req.body); res.json(Object.assign({message:result.duplicate?'Already recorded today':'Attendance recorded',duplicate:!!result.duplicate},result));
});
router.post('/self', auth, (req,res) => {
  if(req.user.role!=='student'||!req.user.student_id) return res.status(403).json({error:'Student account required'});
  const db=req.app.get('db'); const policy=checkPolicy(db,req.body); if(policy) return res.status(403).json({error:policy});
  const student=db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.student_id); if(!student) return res.status(404).json({error:'Student profile not found'});
  const result=record(db,student,req.user.username,req.body); res.json(Object.assign({message:result.duplicate?'Already recorded today':'Attendance recorded',duplicate:!!result.duplicate},result));
});
router.get('/today', auth, staff, (req,res) => { const t=localParts().date; res.json(req.app.get('db').prepare('SELECT a.*,s.full_name,s.sex FROM attendance a JOIN students s ON a.student_id=s.id WHERE a.date=? ORDER BY a.time_in').all(t)); });
router.get('/date/:date', auth, staff, (req,res) => res.json(req.app.get('db').prepare('SELECT a.*,s.full_name,s.sex FROM attendance a JOIN students s ON a.student_id=s.id WHERE a.date=? ORDER BY a.time_in').all(req.params.date)));
router.get('/summary', auth, staff, (req,res) => { const db=req.app.get('db'), t=localParts().date, total=db.prepare('SELECT COUNT(*) count FROM students').get().count, present=db.prepare('SELECT COUNT(*) count FROM attendance WHERE date=?').get(t).count; res.json({total_students:total,present_today:present,absent_today:total-present,attendance_rate:total?Math.round(present/total*100):0}); });
router.get('/export', auth, staff, (req,res) => {
  const from=String(req.query.from||localParts().date), to=String(req.query.to||from); if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to) return res.status(400).json({error:'Use valid from and to dates (YYYY-MM-DD)'});
  const rows=req.app.get('db').prepare('SELECT s.lrn,s.full_name,s.sex,a.date,a.time_in,a.status,a.recorded_by,a.latitude,a.longitude FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.date BETWEEN ? AND ? ORDER BY a.date,s.full_name').all(from,to);
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"'; const csv=[['LRN','Student','Sex','Date','Time','Status','Recorded By','Latitude','Longitude'],...rows.map(r=>[r.lrn,r.full_name,r.sex,r.date,r.time_in,r.status,r.recorded_by,r.latitude,r.longitude])].map(row=>row.map(q).join(',')).join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition',`attachment; filename=attendance_${from}_${to}.csv`); res.send('\uFEFF'+csv);
});
module.exports=router;
