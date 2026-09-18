const express = require('express');
const { getDb, saveDatabase } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { sendSMS } = require('./sms');

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

router.post('/scan', authenticateToken, async (req, res) => {
    const { qr_data } = req.body;
    const today = new Date().toISOString().split('T');
    const now = new Date();
    const timeNow = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    if (!qr_data) return res.status(400).json({ error: 'QR data is required.' });

    const db = getDb();
    const students = rowsToObjects(db.exec("SELECT * FROM students WHERE qr_code = ? AND status = 'Active'", [qr_data]));
    if (students.length === 0) return res.status(404).json({ error: 'Student not found. Invalid QR code. Make sure QR codes have been generated first.' });
    const student = students;

    const existing = rowsToObjects(db.exec('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [student.id, today]));
    if (existing.length > 0) return res.status(409).json({ error: 'Attendance already recorded today', student: `${student.first_name} ${student.last_name}`, time: existing.time_in, status: existing.status });

    const hour = now.getHours();
    const minute = now.getMinutes();
    const status = (hour > 7 || (hour === 7 && minute > 30)) ? 'Late' : 'Present';

    db.run('INSERT INTO attendance (student_id, date, status, time_in, recorded_by) VALUES (?, ?, ?, ?, ?)', [student.id, today, status, timeNow, req.user.id]);
    saveDatabase();

    let smsStatus = 'No guardian contact';
    if (student.guardian_contact) {
        const message = `[QRAttend] Good day! Your child ${student.first_name} ${student.last_name} has been marked ${status.toUpperCase()} at Sta. Rosa ES on ${today} at ${timeNow}. - Grade 6 Great Geniuses`;
        const smsResult = await sendSMS(student.guardian_contact, message, student.id);
        smsStatus = smsResult.success ? 'Sent' : 'Failed';
    }

    res.json({ message: 'Attendance recorded successfully! ✅', student: `${student.first_name} ${student.last_name}`, gender: student.gender, status, time: timeNow, date: today, sms: smsStatus });
});

router.post('/manual', authenticateToken, async (req, res) => {
    const { student_id, date, status, remarks } = req.body;
    const timeNow = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    if (!student_id || !date || !status) return res.status(400).json({ error: 'Student ID, date, and status are required.' });

    const db = getDb();
    const students = rowsToObjects(db.exec('SELECT * FROM students WHERE id = ?', [student_id]));
    if (students.length === 0) return res.status(404).json({ error: 'Student not found' });
    const student = students;

    const existing = rowsToObjects(db.exec('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [student_id, date]));
    if (existing.length > 0) return res.status(409).json({ error: 'Attendance already recorded for this date.' });

    db.run('INSERT INTO attendance (student_id, date, status, time_in, remarks, recorded_by) VALUES (?, ?, ?, ?, ?, ?)', [student_id, date, status, timeNow, remarks || '', req.user.id]);
    saveDatabase();

    let smsStatus = 'No SMS needed';
    if (student.guardian_contact && (status === 'Present' || status === 'Late')) {
        const message = `[QRAttend] Your child ${student.first_name} ${student.last_name} has been marked ${status.toUpperCase()} at Sta. Rosa ES on ${date}. - Grade 6 Great Geniuses`;
        const smsResult = await sendSMS(student.guardian_contact, message, student.id);
        smsStatus = smsResult.success ? 'Sent' : 'Failed';
    }

    res.json({ message: 'Attendance recorded', student: `${student.first_name} ${student.last_name}`, status, date, sms: smsStatus });
});

router.get('/today', authenticateToken, (req, res) => {
    const today = new Date().toISOString().split('T');
    const db = getDb();
    const records = rowsToObjects(db.exec("SELECT a.*, s.first_name, s.last_name, s.middle_name, s.gender FROM attendance a JOIN students s ON a.student_id = s.id WHERE a.date = ? ORDER BY a.created_at ASC", [today]));
    const totalResult = db.exec("SELECT COUNT(*) as count FROM students WHERE status = 'Active'");
    const totalStudents = totalResult.values;
    const presentCount = records.filter(r => r.status === 'Present').length;
    const lateCount = records.filter(r => r.status === 'Late').length;

    res.json({ date: today, total_students: totalStudents, present: presentCount, late: lateCount, absent: totalStudents - records.length, attendance_rate: totalStudents > 0 ? (((presentCount + lateCount) / totalStudents) * 100).toFixed(1) : '0.0', records });
});

router.get('/date/:date', authenticateToken, (req, res) => {
    const db = getDb();
    const records = rowsToObjects(db.exec("SELECT a.*, s.first_name, s.last_name, s.middle_name, s.gender FROM attendance a JOIN students s ON a.student_id = s.id WHERE a.date = ? ORDER BY s.gender DESC, s.last_name ASC", [req.params.date]));
    res.json(records);
});

router.get('/student/:id', authenticateToken, (req, res) => {
    const db = getDb();
    const records = rowsToObjects(db.exec('SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 60', [req.params.id]));
    res.json(records);
});

router.get('/monthly/:year/:month', authenticateToken, (req, res) => {
    const { year, month } = req.params;
    const prefix = `${year}-${month.padStart(2, '0')}`;
    const db = getDb();
    const records = rowsToObjects(db.exec("SELECT a.date, a.status, s.id as student_id, s.first_name, s.last_name, s.gender FROM attendance a JOIN students s ON a.student_id = s.id WHERE a.date LIKE ? ORDER BY a.date ASC", [`${prefix}%`]));
    res.json(records);
});

module.exports = router;
