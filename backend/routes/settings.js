const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const defaults = { gps_enabled: '0', attendance_mode: 'onsite', school_latitude: '', school_longitude: '', geofence_radius_m: '100', qr_enabled: '1', qr_start: '', qr_end: '', school_start: '08:00', attendance_deadline: '16:00', absence_threshold: '5', late_after: '08:00', sms_enabled: '0' };
function values(db) { const rows = db.prepare('SELECT setting_key, setting_value FROM app_settings').all(); return Object.assign({}, defaults, ...rows.map(r => ({ [r.setting_key]: r.setting_value }))); }
router.get('/', auth, (req, res) => res.json(values(req.app.get('db'))));
router.put('/', auth, (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) return res.status(403).json({ error: 'Teacher or admin account required' });
  const allowed = Object.keys(defaults); const db = req.app.get('db');
  for (const key of allowed) if (req.body[key] !== undefined) db.prepare('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value').run(key, String(req.body[key]));
  res.json(values(db));
});
module.exports = router;
