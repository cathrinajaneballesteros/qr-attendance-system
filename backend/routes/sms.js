
var express = require('express');
var router = express.Router();
var db = require('../database/db');
var auth = require('../middleware/auth');

// GET all SMS logs
router.get('/', auth, function(req, res) {
    try {
        var logs = db.all("SELECT l.*, s.first_name, s.last_name, (s.last_name || ', ' || s.first_name) as student_name FROM sms_logs l LEFT JOIN students s ON l.student_id = s.id ORDER BY l.created_at DESC LIMIT 100", []);
        res.json(logs);
    } catch (err) {
        console.error('Get SMS logs error:', err);
        res.status(500).json({ error: 'Failed to load SMS logs' });
    }
});

module.exports = router;

