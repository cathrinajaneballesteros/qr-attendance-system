const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

function staff(req, res, next) {
    if (!['admin', 'teacher'].includes(req.user.role)) {
        return res.status(403).json({
            error: 'Teacher or admin account required'
        });
    }
    next();
}

/*
 * Add these columns to older SQLite databases the first time
 * the students API is used.
 */
function ensureStudentColumns(db) {
    const columns = db.prepare('PRAGMA table_info(students)').all()
        .map(function (column) {
            return column.name;
        });

    if (!columns.includes('student_phone')) {
        db.exec('ALTER TABLE students ADD COLUMN student_phone TEXT');
    }

    if (!columns.includes('email')) {
        db.exec('ALTER TABLE students ADD COLUMN email TEXT');
    }
}

router.get('/', auth, staff, function (req, res) {
    try {
        const db = req.app.get('db');
        ensureStudentColumns(db);

        const students = db.prepare(
            'SELECT * FROM students ORDER BY sex, full_name'
        ).all();

        res.json(students);
    } catch (error) {
        console.error('Get students error:', error.message);
        res.status(500).json({ error: 'Could not load students' });
    }
});

router.get('/:id', auth, staff, function (req, res) {
    try {
        const db = req.app.get('db');
        ensureStudentColumns(db);

        const student = db.prepare(
            'SELECT * FROM students WHERE id = ?'
        ).get(req.params.id);

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        res.json(student);
    } catch (error) {
        console.error('Get student error:', error.message);
        res.status(500).json({ error: 'Could not load student' });
    }
});

router.post('/', auth, staff, function (req, res) {
    try {
        const db = req.app.get('db');
        ensureStudentColumns(db);

        const fullName = String(req.body.full_name || '').trim();
        const sex = String(req.body.sex || '').trim();
        const lrn = String(req.body.lrn || '').trim();
        const guardianName = String(req.body.guardian_name || '').trim();
        const guardianContact = String(req.body.guardian_contact || '').trim();
        const studentPhone = String(req.body.student_phone || '').trim();
        const email = String(req.body.email || '').trim();

        if (!fullName) {
            return res.status(400).json({
                error: 'Student full name is required'
            });
        }

        const qrCode =
            'QR-' +
            fullName.replace(/[^A-Z]/gi, '').substring(0, 10).toUpperCase() +
            '-' +
            Date.now();

        const result = db.prepare(
            'INSERT INTO students ' +
            '(full_name, sex, lrn, guardian_name, guardian_contact, student_phone, email, qr_code) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            fullName,
            sex,
            lrn,
            guardianName,
            guardianContact,
            studentPhone,
            email,
            qrCode
        );

        res.status(201).json({
            message: 'Student added',
            id: result.lastInsertRowid,
            qr_code: qrCode
        });
    } catch (error) {
        console.error('Add student error:', error.message);
        res.status(500).json({ error: 'Could not add student' });
    }
});

router.put('/:id', auth, staff, function (req, res) {
    try {
        const db = req.app.get('db');
        ensureStudentColumns(db);

        const fullName = String(req.body.full_name || '').trim();
        if (!fullName) {
            return res.status(400).json({
                error: 'Student full name is required'
            });
        }

        db.prepare(
            'UPDATE students SET ' +
            'full_name = ?, sex = ?, lrn = ?, guardian_name = ?, ' +
            'guardian_contact = ?, student_phone = ?, email = ? ' +
            'WHERE id = ?'
        ).run(
            fullName,
            String(req.body.sex || '').trim(),
            String(req.body.lrn || '').trim(),
            String(req.body.guardian_name || '').trim(),
            String(req.body.guardian_contact || '').trim(),
            String(req.body.student_phone || '').trim(),
            String(req.body.email || '').trim(),
            req.params.id
        );

        res.json({ message: 'Student updated' });
    } catch (error) {
        console.error('Update student error:', error.message);
        res.status(500).json({ error: 'Could not update student' });
    }
});

router.delete('/:id', auth, staff, function (req, res) {
    try {
        const db = req.app.get('db');

        db.prepare('DELETE FROM students WHERE id = ?')
            .run(req.params.id);

        res.json({ message: 'Student deleted' });
    } catch (error) {
        console.error('Delete student error:', error.message);
        res.status(500).json({ error: 'Could not delete student' });
    }
});

module.exports = router;