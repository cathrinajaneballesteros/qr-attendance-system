
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

// GET all SMS logs
router.get('/', function(req, res) {
    var user = checkAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        var logs = db.all("SELECT l.*, s.first_name, s.last_name, (s.last_name || ', ' || s.first_name) as student_name FROM sms_logs l LEFT JOIN students s ON l.student_id = s.id ORDER BY l.created_at DESC LIMIT 100", []);
        res.json(logs);
    } catch (err) {
        console.error('Get SMS logs error:', err);
        res.status(500).json({ error: 'Failed to load SMS logs' });
    }
});

// POST send SMS
router.post('/send', function(req, res) {
    var user = checkAuth(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        var studentId = req.body.student_id;
        var phoneNumber = req.body.phone_number || 'N/A';
        var message = req.body.message;

        if (!studentId || !message) {
            return res.status(400).json({ error: 'Student and message are required.' });
        }

        db.run('INSERT INTO sms_logs (student_id, phone_number, message, status, provider) VALUES (?, ?, ?, ?, ?)',
            [studentId, phoneNumber, message, 'mock', 'mock']);

        res.json({ message: 'SMS notification logged successfully (mock mode).' });
    } catch (err) {
        console.error('Send SMS error:', err);
        res.status(500).json({ error: 'Failed to send SMS.' });
    }
});

module.exports = router;

