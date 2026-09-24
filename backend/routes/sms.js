
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

module.exports = router;

