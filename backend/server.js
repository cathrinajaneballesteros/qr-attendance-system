
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// HARDCODE the JWT secret so it NEVER changes
var JWT_SECRET = 'qr-attendance-secret-key-2026';
process.env.JWT_SECRET = JWT_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Database
const { initDatabase } = require('./database/db');
var db = initDatabase();
app.set('db', db);

// Store JWT_SECRET on app so all routes can access it
app.set('JWT_SECRET', JWT_SECRET);

// Routes
var authRoutes = require('./routes/auth');
var studentRoutes = require('./routes/students');
var attendanceRoutes = require('./routes/attendance');
var sf2Routes = require('./routes/sf2');
var smsRoutes = require('./routes/sms');

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/sf2', sf2Routes);
app.use('/api/sms', smsRoutes);

// Health check
app.get('/api/health', function(req, res) {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend for all other routes
app.get('*', function(req, res) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

function startServer() {
    app.listen(PORT, function() {
        console.log('Server running at http://localhost:' + PORT);
        console.log('JWT_SECRET set to:', JWT_SECRET.substring(0, 15) + '...');
    });
}

startServer();

