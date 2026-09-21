
var express = require('express');
var router = express.Router();
var db = require('../database/db');
var auth = require('../middleware/auth');

// GET all students
router.get('/', auth, function(req, res) {
    try {
        var students = db.all('SELECT * FROM students ORDER BY gender ASC, last_name ASC', []);
        res.json(students);
    } catch (err) {
        console.error('Get students error:', err);
        res.status(500).json({ error: 'Failed to load students' });
    }
});

// GET single student
router.get('/:id', auth, function(req, res) {
    try {
        var student = db.get('SELECT * FROM students WHERE id = ?', [parseInt(req.params.id)]);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        res.json(student);
    } catch (err) {
        console.error('Get student error:', err);
        res.status(500).json({ error: 'Failed to load student' });
    }
});

// POST add new student
router.post('/', auth, function(req, res) {
    try {
        var body = req.body;
        if (!body.first_name || !body.last_name || !body.gender) {
            return res.status(400).json({ error: 'First name, last name, and gender are required.' });
        }
        var qrCode = body.first_name + ' ' + body.last_name;
        var result = db.run('INSERT INTO students (first_name, middle_name, last_name, gender, lrn, guardian_name, guardian_phone, qr_code, assigned_teacher) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [body.first_name, body.middle_name || null, body.last_name, body.gender, body.lrn || null, body.guardian_name || null, body.guardian_phone || null, qrCode, req.user.id]);
        res.status(201).json({ message: 'Student added successfully', id: result.lastInsertRowid, qr_code: qrCode });
    } catch (err) {
        console.error('Add student error:', err);
        res.status(500).json({ error: 'Failed to add student' });
    }
});

// PUT update student
router.put('/:id', auth, function(req, res) {
    try {
        var body = req.body;
        if (!body.first_name || !body.last_name || !body.gender) {
            return res.status(400).json({ error: 'First name, last name, and gender are required.' });
        }
        var qrCode = body.first_name + ' ' + body.last_name;
        db.run('UPDATE students SET first_name = ?, middle_name = ?, last_name = ?, gender = ?, lrn = ?, guardian_name = ?, guardian_phone = ?, qr_code = ? WHERE id = ?',
            [body.first_name, body.middle_name || null, body.last_name, body.gender, body.lrn || null, body.guardian_name || null, body.guardian_phone || null, qrCode, parseInt(req.params.id)]);
        res.json({ message: 'Student updated successfully' });
    } catch (err) {
        console.error('Update student error:', err);
        res.status(500).json({ error: 'Failed to update student' });
    }
});

// DELETE student
router.delete('/:id', auth, function(req, res) {
    try {
        var id = parseInt(req.params.id);
        db.run('DELETE FROM attendance WHERE student_id = ?', [id]);
        db.run('DELETE FROM sms_logs WHERE student_id = ?', [id]);
        db.run('DELETE FROM students WHERE id = ?', [id]);
        res.json({ message: 'Student deleted successfully' });
    } catch (err) {
        console.error('Delete student error:', err);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

module.exports = router;

