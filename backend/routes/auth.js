
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');

var JWT_SECRET = process.env.JWT_SECRET || 'qr-attendance-secret-key-2026';

// LOGIN
router.post('/login', function(req, res) {
    try {
        var db = req.app.get('db');
        var username = (req.body.username || '').trim();
        var password = req.body.password || '';

        console.log('=== LOGIN ATTEMPT ===');
        console.log('Username:', username);

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        var user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        var validPassword = bcrypt.compareSync(password, user.password);
        console.log('Password valid:', validPassword);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Create token with SAME secret used in middleware
        var token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('Login successful for:', username, 'role:', user.role);
        console.log('Token created with secret:', JWT_SECRET.substring(0, 10) + '...');

        res.json({
            token: token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name
            }
        });
    } catch (error) {
        console.log('Login error:', error.message);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// REGISTER (admin only)
router.post('/register', auth, function(req, res) {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can register users' });
        }

        var db = req.app.get('db');
        var fullName = (req.body.full_name || '').trim();
        var username = (req.body.username || '').trim();
        var password = req.body.password || '';
        var role = req.body.role || 'teacher';

        if (!fullName || !username || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        var existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        var hashedPassword = bcrypt.hashSync(password, 10);
        var result = db.prepare('INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, ?)').run(fullName, username, hashedPassword, role);

        console.log('User registered:', username, 'role:', role);
        res.json({ message: 'User registered successfully', id: result.lastInsertRowid });
    } catch (error) {
        console.log('Register error:', error.message);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// GET ALL USERS (admin only)
router.get('/users', auth, function(req, res) {
    try {
        console.log('GET /users called by:', req.user.username, 'role:', req.user.role);

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can view users' });
        }

        var db = req.app.get('db');
        var users = db.prepare('SELECT id, full_name, username, role FROM users ORDER BY id').all();

        console.log('Returning', users.length, 'users');
        res.json(users);
    } catch (error) {
        console.log('Get users error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE USER (admin only)
router.delete('/users/:id', auth, function(req, res) {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can delete users' });
        }

        var db = req.app.get('db');
        var userId = req.params.id;

        var user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        if (user && user.username === 'admin') {
            return res.status(400).json({ error: 'Cannot delete default admin' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        console.log('User deleted, id:', userId);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.log('Delete user error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

