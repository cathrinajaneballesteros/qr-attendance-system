
var express = require('express');
var router = express.Router();
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var db = require('../database/db');
var auth = require('../middleware/auth');

var JWT_SECRET = process.env.JWT_SECRET || 'qr-attendance-secret-key-2025';

// POST login
router.post('/login', function(req, res) {
    try {
        var username = req.body.username;
        var password = req.body.password;

        console.log('=== LOGIN DEBUG ===');
        console.log('Username:', username);

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        var user = db.get('SELECT * FROM users WHERE username = ?', [username]);
        console.log('User found:', user ? 'YES' : 'NO');

        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        var passwordValid = bcrypt.compareSync(password, user.password);
        console.log('Password valid:', passwordValid);
        console.log('===================');

        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        var token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token: token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// POST register (admin only)
router.post('/register', auth, function(req, res) {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can register new users.' });
        }

        var username = req.body.username;
        var password = req.body.password;
        var fullName = req.body.full_name;
        var role = req.body.role || 'teacher';

        if (!username || !password || !fullName) {
            return res.status(400).json({ error: 'Username, password, and full name are required.' });
        }

        var existing = db.get('SELECT id FROM users WHERE username = ?', [username]);
        if (existing) {
            return res.status(400).json({ error: 'Username already exists.' });
        }

        var hash = bcrypt.hashSync(password, 10);
        db.run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)', [username, hash, fullName, role]);

        res.status(201).json({ message: 'User ' + username + ' created successfully.' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Failed to register user.' });
    }
});

// GET all users (admin only)
router.get('/users', auth, function(req, res) {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can view users.' });
        }
        var users = db.all('SELECT id, username, full_name, role, created_at FROM users ORDER BY created_at DESC', []);
        res.json(users);
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Failed to load users.' });
    }
});

// DELETE user (admin only)
router.delete('/users/:id', auth, function(req, res) {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can delete users.' });
        }
        var userId = parseInt(req.params.id);
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'You cannot delete your own account.' });
        }
        db.run('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});

module.exports = router;

