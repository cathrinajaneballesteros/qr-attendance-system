
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
function staff(req,res,next){if(!['admin','teacher'].includes(req.user.role))return res.status(403).json({error:'Teacher or admin account required'});next();}


router.get('/', auth, staff, function(req, res) {
    try {
        var db = req.app.get('db');
        var students = db.prepare('SELECT * FROM students ORDER BY sex, full_name').all();
        res.json(students);
    } catch (error) {
        console.log('Get students error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/:id', auth, staff, function(req, res) {
    try {
        var db = req.app.get('db');
        var student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/', auth, staff, function(req, res) {
    try {
        var db = req.app.get('db');
        var full_name = req.body.full_name || '';
        var sex = req.body.sex || '';
        var lrn = req.body.lrn || '';
        var guardian_name = req.body.guardian_name || '';
        var guardian_contact = req.body.guardian_contact || '';
        var student_phone = req.body.student_phone || '';
        var email = req.body.email || '';
        if (!full_name) return res.status(400).json({ error: 'Full name is required' });
        var qrCode = 'QR-' + full_name.replace(/[^A-Z]/gi, '').substring(0, 10).toUpperCase() + '-' + Date.now();
        var result = db.prepare('INSERT INTO students (full_name, sex, lrn, guardian_name, guardian_contact, student_phone, email, qr_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(full_name, sex, lrn, guardian_name, guardian_contact, student_phone, email, qrCode);
        res.json({ message: 'Student added', id: result.lastInsertRowid, qr_code: qrCode });
    } catch (error) {
        console.log('Add student error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/:id', auth, staff, function(req, res) {
    try {
        var db = req.app.get('db');
        db.prepare('UPDATE students SET full_name = ?, sex = ?, guardian_name = ?, guardian_contact = ?, student_phone = ?, email = ? WHERE id = ?').run(req.body.full_name || '', req.body.sex || '', req.body.guardian_name || '', req.body.guardian_contact || '', req.body.student_phone || '', req.body.email || '', req.params.id);
        res.json({ message: 'Student updated' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/:id', auth, staff, function(req, res) {
    try {
        var db = req.app.get('db');
        db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
        res.json({ message: 'Student deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

