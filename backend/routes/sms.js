
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.post('/send', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var studentId = req.body.student_id;
        var message = req.body.message || '';
        var student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        var contact = student.guardian_contact || 'N/A';
        db.prepare('INSERT INTO sms_logs (student_id, guardian_contact, message, status) VALUES (?, ?, ?, ?)').run(studentId, contact, message, contact === 'N/A' ? 'no_contact' : 'sent');
        console.log('SMS to', contact, ':', message);
        res.json({ message: 'SMS logged', contact: contact });
    } catch (error) {
        console.log('SMS error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/logs', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var logs = db.prepare('SELECT l.*, s.full_name FROM sms_logs l JOIN students s ON l.student_id = s.id ORDER BY l.created_at DESC').all();
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

