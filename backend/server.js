const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./database/db');
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const attendanceRoutes = require('./routes/attendance');
const smsRoutes = require('./routes/sms');
const sf2Routes = require('./routes/sf2');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/sf2', sf2Routes);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function startServer() {
    await initDatabase();

    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║   QR Attendance System with SMS & SF2        ║');
        console.log('║   Sta. Rosa ES | Grade 6 - Great Geniuses    ║');
        console.log('╚══════════════════════════════════════════════╝');
        console.log(`✅ Server running at http://localhost:${PORT}`);
        console.log(`📱 SMS Provider: ${process.env.SMS_PROVIDER || 'mock'}`);
        console.log('');
    });
}

startServer();
