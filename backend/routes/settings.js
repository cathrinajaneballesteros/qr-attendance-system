const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

const defaults = {
    gps_enabled: '0',
    attendance_mode: 'onsite',
    school_latitude: '',
    school_longitude: '',
    geofence_radius_m: '100',
    qr_enabled: '1',
    qr_start: '',
    qr_end: '',
    school_start: '08:00',
    attendance_deadline: '16:00',
    absence_threshold: '5',
    late_after: '08:00',
    sms_enabled: '0'
};

function getSettings(db) {
    const rows = db.prepare(
        'SELECT setting_key, setting_value FROM app_settings'
    ).all();

    const stored = {};
    rows.forEach(function (row) {
        stored[row.setting_key] = row.setting_value;
    });

    return Object.assign({}, defaults, stored);
}

router.get('/', auth, function (req, res) {
    res.json(getSettings(req.app.get('db')));
});

router.put('/', auth, function (req, res) {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Teacher account required' });
    }

    const db = req.app.get('db');

    Object.keys(defaults).forEach(function (key) {
        if (req.body[key] !== undefined) {
            db.prepare(
                'INSERT INTO app_settings (setting_key, setting_value) ' +
                'VALUES (?, ?) ' +
                'ON CONFLICT(setting_key) DO UPDATE SET ' +
                'setting_value = excluded.setting_value'
            ).run(key, String(req.body[key]));
        }
    });

    res.json(getSettings(db));
});

module.exports = router;