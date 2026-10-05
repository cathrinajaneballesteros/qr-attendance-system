
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('JWT_SECRET must be configured before starting the server'); process.exit(1); }
process.env.JWT_SECRET = JWT_SECRET;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.set('JWT_SECRET', JWT_SECRET);

var authRoutes = require('./routes/auth');
var studentRoutes = require('./routes/students');
var attendanceRoutes = require('./routes/attendance');
var sf2Routes = require('./routes/sf2');
var smsRoutes = require('./routes/sms');
var settingsRoutes = require('./routes/settings');
var studentAccountRoutes = require('./routes/student-account');

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/sf2', sf2Routes);
app.use('/api/sms', smsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/student-account', studentAccountRoutes);

app.get('/api/health', function(req, res) {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('*', function(req, res) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

async function startServer() {
    try {
        var dbModule = require('./database/db');
        var db = await dbModule.initDatabase();
        app.set('db', db);
        require('./services/notifications').startDailyNotifier(db);
        console.log('Database ready');
        app.listen(PORT, function() {
            console.log('Server running at http://localhost:' + PORT);
        });
    } catch (err) {
        console.log('Failed to start:', err.message);
        process.exit(1);
    }
}

startServer();

