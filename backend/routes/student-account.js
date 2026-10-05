const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');

router.post('/create', auth, (req, res) => {
  try {
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Teacher or admin account required'
      });
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

    if (
      usernameOwner &&
      (!existingAccount || Number(usernameOwner.id) !== Number(existingAccount.id))
    ) {
      return res.status(409).json({
        error: 'That username is already in use'
      });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    if (existingAccount) {
      db.prepare(
        'UPDATE users SET full_name = ?, username = ?, email = ?, password = ? WHERE id = ?'
      ).run(
        student.full_name,
        username,
        username,
        passwordHash,
        existingAccount.id
      );
    } else {
      db.prepare(
        "INSERT INTO users (full_name, username, email, password, role, student_id) " +
        "VALUES (?, ?, ?, ?, 'student', ?)"
      ).run(
        student.full_name,
        username,
        username,
        passwordHash,
        studentId
      );
    }

    // Confirm that the username and password were actually saved.
    const savedAccount = db.prepare(
      "SELECT username, password FROM users WHERE student_id = ? AND role = 'student'"
    ).get(studentId);

    if (
      !savedAccount ||
      savedAccount.username !== username ||
      !bcrypt.compareSync(password, savedAccount.password)
    ) {
      console.error('Student account verification failed for student ID:', studentId);
      return res.status(500).json({
        error: 'The account could not be verified in the database. Check the Render service logs.'
      });
    }

    return res.json({
      message: 'Student account created and verified'
    });
  } catch (error) {
    console.error('Create student account error:', error.message);
    return res.status(500).json({
      error: 'Could not create the student account. Check the Render service logs.'
    });
  }
});

router.get('/me', auth, (req, res) => {
  try {
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

    return res.json({ student, records });
  } catch (error) {
    console.error('Load student account error:', error.message);
    return res.status(500).json({ error: 'Could not load the student account' });
  }
});

router.post('/change-password', auth, (req, res) => {
  try {
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

    const passwordHash = bcrypt.hashSync(newPassword, 10);

    db.prepare(
      'UPDATE users SET password = ? WHERE id = ?'
    ).run(passwordHash, user.id);

    const savedUser = db.prepare(
      'SELECT password FROM users WHERE id = ?'
    ).get(user.id);

    if (!savedUser || !bcrypt.compareSync(newPassword, savedUser.password)) {
      return res.status(500).json({
        error: 'Could not verify the changed password'
      });
    }

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change student password error:', error.message);
    return res.status(500).json({ error: 'Could not change the password' });
  }
});

module.exports = router;