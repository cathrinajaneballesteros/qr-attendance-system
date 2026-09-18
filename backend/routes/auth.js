
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, run } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// LOGIN
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

    try {
        const users = query("SELECT * FROM users WHERE username = ?", [username]);

        console.log('=== LOGIN DEBUG ===');
        console.log('Username entered:', username);
        console.log('Users found:', users.length);
        if (users.length > 0) {
            console.log('First user:', JSON.stringify(users[0]));
        }
        console.log('===================');

        if (!users || users.length === 0) return res.status(401).json({ error: 'Invalid username or password.' });

        const user = users[0];

        if (!user || !user.password) {
            console.log('ERROR: User object or password is undefined!');
            return res.status(500).json({ error: 'Database error - user data corrupted' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        console.log('Password valid:', validPassword);

        if (!validPassword) return res.status(401).json({ error: 'Invalid username or password.' });

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
            process.env.JWT_SECRET || 'qr-attendance-secret-key-2024',
            { expiresIn: '8h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, school: user.school }
        });
    } catch (err) {
        console.error('LOGIN CRASH ERROR:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// REGISTER NEW USER (Admin only)
router.post('/register', authenticateToken, requireAdmin, (req, res) => {
    const { username, password, full_name, role } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'All fields are required.' });

    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const existing = query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length > 0) return res.status(409).json({ error: 'Username already exists.' });

    const hash = bcrypt.hashSync(password, 10);
    run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", [username, hash, full_name, role || 'teacher']);
    console.log(`✅ New user created: ${full_name} (${role || 'teacher'})`);
    res.status(201).json({ message: 'User created successfully' });
});

// GET ALL USERS (Admin only)
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = query("SELECT id, username, full_name, role, school, created_at FROM users ORDER BY created_at ASC");
        res.json(users);
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Failed to get users: ' + err.message });
    }
});

// DELETE USER (Admin only)
router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;

    try {
        // Prevent deleting the main admin
        const user = query("SELECT username FROM users WHERE id = ?", [parseInt(id)]);
        if (user.length === 0) return res.status(404).json({ error: 'User not found.' });
        if (user[0].username === 'admin') return res.status(403).json({ error: 'Cannot delete the main admin account.' });

        run("DELETE FROM users WHERE id = ?", [parseInt(id)]);
        console.log(`🗑️ User deleted: ${user[0].username}`);
        res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user: ' + err.message });
    }
});

// RESET PASSWORD (Admin only)
router.put('/users/:id/reset-password', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    try {
        const user = query("SELECT username FROM users WHERE id = ?", [parseInt(id)]);
        if (user.length === 0) return res.status(404).json({ error: 'User not found.' });

        const hash = bcrypt.hashSync(password, 10);
        run("UPDATE users SET password = ? WHERE id = ?", [hash, parseInt(id)]);
        console.log(`🔑 Password reset for: ${user[0].username}`);
        res.json({ message: 'Password reset successfully.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Failed to reset password: ' + err.message });
    }
});

// GET CURRENT USER
router.get('/me', authenticateToken, (req, res) => {
    const users = query("SELECT id, username, full_name, role, school, created_at FROM users WHERE id = ?", [req.user.id]);
    if (!users || users.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(users[0]);
});

module.exports = router;

