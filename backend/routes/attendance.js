
var express = require('express');
var router = express.Router();
var db = require('../database/db');
var auth = require('../middleware/auth');

// GET recent attendance (for dashboard)
router.get('/recent', auth, function(req, res) {
    try {
        var records = db.prepare("\
            SELECT a.*, s.first_name, s.last_name, s.middle_name,\
            (s.last_name || ', ' || s.first_name) as student_name\
            FROM attendance a\
            JOIN students s ON a.student_id = s.id\
            ORDER BY a.created_at DESC\
            LIMIT 20\
        ").all();
        res.json(records);
    } catch (err) {
        console.error('Recent attendance error:', err);
        res.status(500).json({ error: 'Failed to load recent attendance' });
    }
});

// GET attendance by date
router.get('/', auth, function(req, res) {
    try {
        var date = req.query.date || new Date().toISOString().split('T')[0];
        var records = db.prepare("\
            SELECT a.*, s.first_name, s.last_name, s.middle_name,\
            (s.last_name || ', ' || s.first_name) as student_name\
            FROM attendance a\
            JOIN students s ON a.student_id = s.id\
            WHERE a.date = ?\
            ORDER BY s.last_name ASC\
        ").all(date);
        res.json(records);
    } catch (err) {
        console.error('Get attendance error:', err);
        res.status(500).json({ error: 'Failed to load attendance' });
    }
});

// POST record attendance manually
router.post('/', auth, function(req, res) {
    try {
        var studentId = req.body.student_id;
        var status = req.body.status || 'Present';
        var date = req.body.date || new Date().toISOString().split('T')[0];
        var now = new Date();
        var timeIn = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        if (!studentId) return res.status(400).json({ error: 'Student ID is required' });

        // Check if already recorded today
        var existing = db.prepare('SELECT id FROM attendance WHERE student_id = ? AND date = ?').get(studentId, date);
        if (existing) {
            return res.status(400).json({ error: 'Attendance already recorded for this student today.' });
        }

        var student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        db.prepare('INSERT INTO attendance (student_id, date, status, time_in, recorded_by) VALUES (?, ?, ?, ?, ?)').run(studentId, date, status, timeIn, req.user.id);

        // Log SMS (mock)
        if (student.guardian_phone) {
            var message = 'QRAttend: ' + student.first_name + ' ' + student.last_name + ' was marked ' + status + ' on ' + date + ' at ' + timeIn + '. - Sta. Rosa ES';
            db.prepare('INSERT INTO sms_logs (student_id, phone_number, message, status, provider) VALUES (?, ?, ?, ?, ?)').run(studentId, student.guardian_phone, message, 'mock', 'mock');
        }

        res.json({
            message: 'Attendance recorded successfully',
            student_name: student.first_name + ' ' + student.last_name,
            status: status,
            time_in: timeIn
        });
    } catch (err) {
        console.error('Record attendance error:', err);
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

// POST scan QR code
router.post('/scan', auth, function(req, res) {
    try {
        var qrCode = req.body.qr_code;
        if (!qrCode) return res.status(400).json({ error: 'QR code is required' });

        var student = db.prepare('SELECT * FROM students WHERE qr_code = ?').get(qrCode);
        if (!student) return res.status(404).json({ error: 'Student not found for QR code: ' + qrCode });

        var date = new Date().toISOString().split('T')[0];
        var now = new Date();
        var timeIn = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        // Check if already recorded today
        var existing = db.prepare('SELECT id FROM attendance WHERE student_id = ? AND date = ?').get(student.id, date);
        if (existing) {
            return res.status(400).json({ error: student.first_name + ' ' + student.last_name + ' already recorded today.' });
        }

        var status = 'Present';

        db.prepare('INSERT INTO attendance (student_id, date, status, time_in, recorded_by) VALUES (?, ?, ?, ?, ?)').run(student.id, date, status, timeIn, req.user.id);

        // Log SMS (mock)
        if (student.guardian_phone) {
            var message = 'QRAttend: ' + student.first_name + ' ' + student.last_name + ' was marked ' + status + ' on ' + date + ' at ' + timeIn + '. - Sta. Rosa ES';
            db.prepare('INSERT INTO sms_logs (student_id, phone_number, message, status, provider) VALUES (?, ?, ?, ?, ?)').run(student.id, student.guardian_phone, message, 'mock', 'mock');
        }

        res.json({
            message: 'Attendance recorded',
            student_name: student.first_name + ' ' + student.last_name,
            status: status,
            time_in: timeIn
        });
    } catch (err) {
        console.error('Scan QR error:', err);
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

module.exports = router;

