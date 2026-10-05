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
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!studentId || !username || !password) {
    return res.status(400).json({
      error: 'Select a student and enter a username and password'
    });
  }

  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–40 characters and use only letters, numbers, dots, underscores, or hyphens'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters'
    });
  }

  const student = db.prepare(
    'SELECT id, full_name FROM students WHERE id = ?'
  ).get(studentId);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'That username is already in use' });
  }

  const existingAccount = db.prepare(
    "SELECT id FROM users WHERE student_id = ? AND role = 'student'"
  ).get(studentId);

  if (existingAccount) {
    return res.status(409).json({
      error: 'This student already has an account'
    });
  }

  const result = db.prepare(
    "INSERT INTO users (full_name, username, email, password, role, student_id) " +
    "VALUES (?, ?, NULL, ?, 'student', ?)"
  ).run(
    student.full_name,
    username,
    bcrypt.hashSync(password, 10),
    studentId
  );

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
    'SELECT id, full_name, sex, qr_code, student_phone ' +
    'FROM students WHERE id = ?'
  ).get(req.user.student_id);

  if (!student) {
    return res.status(404).json({ error: 'Student profile not found' });
  }

  const records = db.prepare(
    'SELECT date, time_in, status FROM attendance ' +
    'WHERE student_id = ? ORDER BY date DESC LIMIT 100'
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
    return res.status(400).json({
      error: 'New password must be at least 8 characters'
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      error: 'Choose a password different from your current password'
    });
  }

  const db = req.app.get('db');
  const user = db.prepare(
    "SELECT id, password FROM users WHERE id = ? AND role = 'student'"
  ).get(req.user.id);

  if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(
    bcrypt.hashSync(newPassword, 10),
    user.id
  );

  res.json({ message: 'Password changed successfully' });
});

module.exports = router;