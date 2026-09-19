
var express = require('express');
var router = express.Router();
var db = require('../database/db');
var auth = require('../middleware/auth');

// GET all students
router.get('/', auth, function(req, res) {
    try {
        var students = db.prepare('SELECT * FROM students ORDER BY gender ASC, last_name ASC').all();
        res.json(students);
    } catch (err) {
        console.error('Get students error:', err);
        res.status(500).json({ error: 'Failed to load students' });
    }
});

// GET single student
router.get('/:id', auth, function(req, res) {
    try {
        var student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
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
        var firstName = body.first_name;
        var middleName = body.middle_name || null;
        var lastName = body.last_name;
        var gender = body.gender;
        var lrn = body.lrn || null;
        var guardianName = body.guardian_name || null;
        var guardianPhone = body.guardian_phone || null;

        if (!firstName || !lastName || !gender) {
            return res.status(400).json({ error: 'First name, last name, and gender are required.' });
        }

        var qrCode = firstName + ' ' + lastName;

        var result = db.prepare(
            'INSERT INTO students (first_name, middle_name, last_name, gender, lrn, guardian_name, guardian_phone, qr_code, assigned_teacher) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(firstName, middleName, lastName, gender, lrn, guardianName, guardianPhone, qrCode, req.user.id);

        res.status(201).json({
            message: 'Student added successfully',
            id: result.lastInsertRowid,
            qr_code: qrCode
        });
    } catch (err) {
        console.error('Add student error:', err);
        res.status(500).json({ error: 'Failed to add student' });
    }
});

// PUT update student
router.put('/:id', auth, function(req, res) {
    try {
        var body = req.body;
        var firstName = body.first_name;
        var middleName = body.middle_name || null;
        var lastName = body.last_name;
        var gender = body.gender;
        var lrn = body.lrn || null;
        var guardianName = body.guardian_name || null;
        var guardianPhone = body.guardian_phone || null;

        if (!firstName || !lastName || !gender) {
            return res.status(400).json({ error: 'First name, last name, and gender are required.' });
        }

        var qrCode = firstName + ' ' + lastName;

        db.prepare(
            'UPDATE students SET first_name = ?, middle_name = ?, last_name = ?, gender = ?, lrn = ?, guardian_name = ?, guardian_phone = ?, qr_code = ? WHERE id = ?'
        ).run(firstName, middleName, lastName, gender, lrn, guardianName, guardianPhone, qrCode, req.params.id);

        res.json({ message: 'Student updated successfully' });
    } catch (err) {
        console.error('Update student error:', err);
        res.status(500).json({ error: 'Failed to update student' });
    }
});

// DELETE student
router.delete('/:id', auth, function(req, res) {
    try {
        // Delete attendance records first
        db.prepare('DELETE FROM attendance WHERE student_id = ?').run(req.params.id);
        // Delete SMS logs
        db.prepare('DELETE FROM sms_logs WHERE student_id = ?').run(req.params.id);
        // Delete student
        db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
        res.json({ message: 'Student deleted successfully' });
    } catch (err) {
        console.error('Delete student error:', err);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

module.exports = router;

