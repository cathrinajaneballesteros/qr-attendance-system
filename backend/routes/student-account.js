const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');

router.post('/create', auth, (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Teacher or admin account required' });
  }

  const db = req.app.get('db');
  const studentId = Number(req.body.student_id);
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!studentId || !email || password.length < 8) {
    return res.status(400).json({
      error: 'Student, email, and a password of at least 8 characters are required'
    });
  }

  if (!db.prepare('SELECT id FROM students WHERE id = ?').get(studentId)) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(email, email)) {
    return res.status(409).json({ error: 'An account already uses this email' });
  }

  const result = db.prepare(
    "INSERT INTO users (full_name, username, email, password, role, student_id) " +
    "SELECT full_name, ?, ?, ?, 'student', id FROM students WHERE id = ?"
  ).run(email, email, bcrypt.hashSync(password, 10), studentId);

  res.status(201).json({
    id: result.lastInsertRowid,
    message: 'Student account created'
  });
});

router.get('/me', auth, (req, res) => {
  if (req.user.role !== 'student' || !req.user.student_id) {
    return res.status(403).json({ error: 'Student account required' });
  }

  const db = req.app.get('db');
  const student = db.prepare(
    'SELECT id, full_name, sex, qr_code, student_phone FROM students WHERE id = ?'
  ).get(req.user.student_id);

  const records = db.prepare(
    'SELECT date, time_in, status FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 100'
  ).all(req.user.student_id);

  res.json({ student, records });
});

router.post('/change-password', auth, (req, res) => {
  if (req.user.role !== 'student' || !req.user.id) {
    return res.status(403).json({ error: 'Student account required' });
  }

  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Complete all password fields' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Choose a password different from your current one' });
  }

  const db = req.app.get('db');
  const user = db.prepare(
    "SELECT id, password FROM users WHERE id = ? AND role = 'student'"
  ).get(req.user.id);

  if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), user.id);

  res.json({ message: 'Password changed successfully' });
});

module.exports = router;