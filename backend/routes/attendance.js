
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.post('/scan', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var qrCode = req.body.qr_code || '';
        var today = new Date().toISOString().split('T')[0];
        var now = new Date();
        var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        var pht = new Date(utc + (8 * 3600000));
        var h = pht.getHours();
        var m = pht.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        var dh = h % 12;
        if (dh === 0) dh = 12;
        var timeIn = (dh < 10 ? '0' : '') + dh + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;

        var student = db.prepare('SELECT * FROM students WHERE qr_code = ? OR full_name = ?').get(qrCode, qrCode);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        var existing = db.prepare('SELECT * FROM attendance WHERE student_id = ? AND date = ?').get(student.id, today);
        if (existing) {
            return res.json({ message: 'Already recorded today', student: student.full_name, time_in: existing.time_in, duplicate: true });
        }

        db.prepare('INSERT INTO attendance (student_id, date, time_in, status, recorded_by) VALUES (?, ?, ?, ?, ?)').run(student.id, today, timeIn, 'present', req.user.username);

        if (student.guardian_contact) {
            var smsMsg = 'Good day! ' + student.full_name + ' has arrived at school at ' + timeIn + ' on ' + today + '. - QRAttend, Sta. Rosa ES';
            db.prepare('INSERT INTO sms_logs (student_id, guardian_contact, message, status) VALUES (?, ?, ?, ?)').run(student.id, student.guardian_contact, smsMsg, 'sent');
        }

        res.json({ message: 'Attendance recorded', student: student.full_name, time_in: timeIn, date: today });
    } catch (error) {
        console.log('Scan error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/today', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var today = new Date().toISOString().split('T')[0];
        var records = db.prepare('SELECT a.*, s.full_name, s.sex FROM attendance a JOIN students s ON a.student_id = s.id WHERE a.date = ? ORDER BY a.time_in').all(today);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/date/:date', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var records = db.prepare('SELECT a.*, s.full_name, s.sex FROM attendance a JOIN students s ON a.student_id = s.id WHERE a.date = ? ORDER BY a.time_in').all(req.params.date);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/summary', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var today = new Date().toISOString().split('T')[0];
        var totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get();
        var presentToday = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE date = ?').get(today);
        var total = totalStudents ? totalStudents.count : 0;
        var present = presentToday ? presentToday.count : 0;
        var absent = total - present;
        var rate = total > 0 ? Math.round((present / total) * 100) : 0;
        res.json({ total_students: total, present_today: present, absent_today: absent, attendance_rate: rate });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

