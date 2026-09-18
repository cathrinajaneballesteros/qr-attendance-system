const express = require('express');
const QRCode = require('qrcode');
const { getDb, saveDatabase } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function rowsToObjects(result) {
    if (!result || result.length === 0 || result.values.length === 0) return [];
    const cols = result.columns;
    return result.values.map(row => {
        const obj = {};
        cols.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

router.get('/', authenticateToken, (req, res) => {
    const db = getDb();
    const result = db.exec("SELECT * FROM students WHERE status = 'Active' ORDER BY gender DESC, last_name ASC");
    res.json(rowsToObjects(result));
});

router.get('/qrcodes/all', authenticateToken, async (req, res) => {
    const db = getDb();
    const students = rowsToObjects(db.exec("SELECT * FROM students WHERE status = 'Active' ORDER BY gender DESC, last_name ASC"));

    const qrCodes = [];
    for (const student of students) {
        const qrData = `${student.last_name},${student.first_name}, ${student.middle_name}`;
        try {
            const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
            db.run('UPDATE students SET qr_code = ? WHERE id = ?', [qrData, student.id]);
            qrCodes.push({ id: student.id, name: `${student.last_name}, ${student.first_name} ${student.middle_name}`, gender: student.gender, guardian_contact: student.guardian_contact, qr_data: qrData, qr_image: qrImage });
        } catch (err) {
            console.error(`QR generation failed for ${student.last_name}:`, err.message);
        }
    }
    saveDatabase();
    res.json(qrCodes);
});

router.get('/:id', authenticateToken, (req, res) => {
    const db = getDb();
    const result = rowsToObjects(db.exec("SELECT * FROM students WHERE id = ?", [req.params.id]));
    if (result.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(result);
});

router.post('/', authenticateToken, (req, res) => {
    const { lrn, last_name, first_name, middle_name, gender, section, grade_level, guardian_name, guardian_contact } = req.body;
    if (!last_name || !first_name || !gender) return res.status(400).json({ error: 'Last name, first name, and gender are required.' });

    const db = getDb();
    db.run("INSERT INTO students (lrn, last_name, first_name, middle_name, gender, section, grade_level, guardian_name, guardian_contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [lrn || null, last_name, first_name, middle_name || '', gender, section || 'Great Geniuses', grade_level || 'Grade 6', guardian_name || '', guardian_contact || '']);
    saveDatabase();
    res.status(201).json({ message: 'Student added successfully' });
});

router.put('/:id', authenticateToken, (req, res) => {
    const { lrn, last_name, first_name, middle_name, gender, section, grade_level, guardian_name, guardian_contact } = req.body;
    const db = getDb();
    db.run("UPDATE students SET lrn=?, last_name=?, first_name=?, middle_name=?, gender=?, section=?, grade_level=?, guardian_name=?, guardian_contact=? WHERE id=?",
        [lrn, last_name, first_name, middle_name, gender, section, grade_level, guardian_name, guardian_contact, req.params.id]);
    saveDatabase();
    res.json({ message: 'Student updated successfully' });
});

router.delete('/:id', authenticateToken, (req, res) => {
    const db = getDb();
    db.run("UPDATE students SET status = 'Inactive' WHERE id = ?", [req.params.id]);
    saveDatabase();
    res.json({ message: 'Student deactivated' });
});

router.get('/:id/qrcode', authenticateToken, async (req, res) => {
    const db = getDb();
    const result = rowsToObjects(db.exec("SELECT * FROM students WHERE id = ?", [req.params.id]));
    if (result.length === 0) return res.status(404).json({ error: 'Student not found' });
    const student = result;
    const qrData = `${student.last_name},${student.first_name}, ${student.middle_name}`;
    try {
        const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
        db.run('UPDATE students SET qr_code = ? WHERE id = ?', [qrData, student.id]);
        saveDatabase();
        res.json({ student: `${student.last_name}, ${student.first_name} ${student.middle_name}`, gender: student.gender, qr_data: qrData, qr_image: qrImage });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

module.exports = router;
