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
  const username = String(req.body.username || req.body.email || '').trim();
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

  const existingAccount = db.prepare(
    "SELECT id FROM users WHERE student_id = ? AND role = 'student'"
  ).get(studentId);

  const usernameOwner = db.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).get(username);

  if (usernameOwner &&
      (!existingAccount || usernameOwner.id !== existingAccount.id)) {
    return res.status(409).json({ error: 'That username is already in use' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  if (existingAccount) {
    db.prepare(
      'UPDATE users SET full_name = ?, username = ?, email = NULL, password = ? WHERE id = ?'
    ).run(student.full_name, username, passwordHash, existingAccount.id);
  } else {
    db.prepare(
      "INSERT INTO users (full_name, username, email, password, role, student_id) " +
      "VALUES (?, ?, NULL, ?, 'student', ?)"
    ).run(student.full_name, username, passwordHash, studentId);
  }

  // The database wrapper can suppress SQL errors, so verify the saved account.
  const savedAccount = db.prepare(
    "SELECT username, password FROM users WHERE student_id = ? AND role = 'student'"
  ).get(studentId);

  if (!savedAccount ||
      savedAccount.username !== username ||
      !bcrypt.compareSync(password, savedAccount.password)) {
    return res.status(500).json({
      error: 'The account could not be verified in the database. Check the Render service logs.'
    });
  }

  res.json({ message: 'Student account created and verified' });
});

router.get('/me', auth, (req, res) => {
  if (req.user.role !== 'student' || !req.user.student_id) {
    return res.status(403).json({ error: 'Student account required' });
  }

  const db = req.app.get('db');
  const student = db.prepare(
    'SELECT id, full_name, sex, qr_code, student_phone FROM students WHERE id = ?'
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

  const db = req.app.get('db');
  const user = db.prepare(
    "SELECT id, password FROM users WHERE id = ? AND role = 'student'"
  ).get(req.user.id);

  if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(newHash, user.id);

  const saved = db.prepare('SELECT password FROM users WHERE id = ?').get(user.id);

  if (!saved || !bcrypt.compareSync(newPassword, saved.password)) {
    return res.status(500).json({ error: 'Could not verify the changed password' });
  }

  res.json({ message: 'Password changed successfully' });
});

module.exports = router;