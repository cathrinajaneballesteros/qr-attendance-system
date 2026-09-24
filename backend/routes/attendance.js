
var express = require('express');
var router = express.Router();
var db = require('../database/db');
var jwt = require('jsonwebtoken');
var JWT_SECRET = process.env.JWT_SECRET || 'qr-attendance-secret-key-2025';

function checkAuth(req) {
    var authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
        return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (e) { return null; }
}

router.get('/recent', function(req, res) {
    var user = checkAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        var records = db.all("SELECT a.*, s.first_name, s.last_name, s.middle_name, (s.last_name || ', ' || s.first_name) as student_name FROM attendance a JOIN students s ON a.student_id = s.id ORDER BY a.created_at DESC LIMIT 20", []);
        res.json(records);
    } catch (err) {
        console.error('Recent attendance error:', err);
        res.status(500).json({ error: 'Failed to load recent attendance' });
    }
});

router.get('/', function(req, res) {
    var user = checkAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        var date = req.query.date || new Date().toISOString().split('T')[0];
        var records = db.all("SELECT a.*, s.first_name, s.last_name, s.middle_name, (s.last_name || ', ' || s.first_name) as student_name FROM attendance a JOIN students s ON a.student_id = s.id WHERE a.date = ? ORDER BY s.last_name ASC", [date]);
        res.json(records);
    } catch (err) {
        console.error('Get attendance error:', err);
        res.status(500).json({ error: 'Failed to load attendance' });
    }
});

router.post('/', function(req, res) {
    var user = checkAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        var studentId = parseInt(req.body.student_id);
        var status = req.body.status || 'Present';
        var date = req.body.date || new Date().toISOString().split('T')[0];
        var now = new Date();
        var timeIn = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        if (!studentId) return res.status(400).json({ error: 'Student ID is required' });

        var existing = db.get('SELECT id FROM attendance WHERE student_id = ? AND date = ?', [studentId, date]);
        if (existing) return res.status(400).json({ error: 'Attendance already recorded for this student today.' });

        var student = db.get('SELECT * FROM students WHERE id = ?', [studentId]);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        db.run('INSERT INTO attendance (student_id, date, status, time_in, recorded_by) VALUES (?, ?, ?, ?, ?)', [studentId, date, status, timeIn, user.id]);

        if (student.guardian_phone) {
            var message = 'QRAttend: ' + student.first_name + ' ' + student.last_name + ' was marked ' + status + ' on ' + date + ' at ' + timeIn + '. - Sta. Rosa ES';
            db.run('INSERT INTO sms_logs (student_id, phone_number, message, status, provider) VALUES (?, ?, ?, ?, ?)', [studentId, student.guardian_phone, message, 'mock', 'mock']);
        }

        res.json({ message: 'Attendance recorded successfully', student_name: student.first_name + ' ' + student.last_name, status: status, time_in: timeIn });
    } catch (err) {
        console.error('Record attendance error:', err);
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

router.post('/scan', function(req, res) {
    var user = checkAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        var qrCode = req.body.qr_code;
        if (!qrCode) return res.status(400).json({ error: 'QR code is required' });

        var student = db.get('SELECT * FROM students WHERE qr_code = ?', [qrCode]);
        if (!student) return res.status(404).json({ error: 'Student not found for QR code: ' + qrCode });

        var date = new Date().toISOString().split('T')[0];
        var now = new Date();
        var timeIn = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        var existing = db.get('SELECT id FROM attendance WHERE student_id = ? AND date = ?', [student.id, date]);
        if (existing) return res.status(400).json({ error: student.first_name + ' ' + student.last_name + ' already recorded today.' });

        db.run('INSERT INTO attendance (student_id, date, status, time_in, recorded_by) VALUES (?, ?, ?, ?, ?)', [student.id, date, 'Present', timeIn, user.id]);

        if (student.guardian_phone) {
            var message = 'QRAttend: ' + student.first_name + ' ' + student.last_name + ' was marked Present on ' + date + ' at ' + timeIn + '. - Sta. Rosa ES';
            db.run('INSERT INTO sms_logs (student_id, phone_number, message, status, provider) VALUES (?, ?, ?, ?, ?)', [student.id, student.guardian_phone, message, 'mock', 'mock']);
        }

        res.json({ message: 'Attendance recorded', student_name: student.first_name + ' ' + student.last_name, status: 'Present', time_in: timeIn });
    } catch (err) {
        console.error('Scan QR error:', err);
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

module.exports = router;

