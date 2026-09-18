const express = require('express');
const { getDb, saveDatabase } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function rowsToObjects(result) {
    if (!result || result.length === 0 || result.values.length === 0) return [];
    const cols = result.columns;
    return result.values.map(row => {
        const obj = {};
        cols.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

async function sendSMS(phoneNumber, message, studentId) {
    const provider = process.env.SMS_PROVIDER || 'mock';
    let result = {};
    const db = getDb();

    try {
        if (provider === 'semaphore') {
            const response = await fetch('https://api.semaphore.co/api/v4/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apikey: process.env.SEMAPHORE_API_KEY, number: phoneNumber, message: message, sendername: process.env.SENDER_NAME || 'QRAttend' })
            });
            result = await response.json();
            console.log(`📱 [Semaphore] SMS sent to ${phoneNumber}`);
        } else if (provider === 'twilio') {
            const twilio = require('twilio');
            const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            result = await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER, to: phoneNumber });
            console.log(`📱 [Twilio] SMS sent to ${phoneNumber}`);
        } else {
            console.log(`📱 [MOCK SMS] To: ${phoneNumber}`);
            console.log(`   Message: ${message}`);
            result = { status: 'mock_sent', provider: 'mock' };
        }

        db.run('INSERT INTO sms_logs (student_id, guardian_contact, message, status, provider) VALUES (?, ?, ?, ?, ?)', [studentId, phoneNumber, message, 'Sent', provider]);
        saveDatabase();
        return { success: true, provider, result };
    } catch (err) {
        console.error(`❌ SMS failed to ${phoneNumber}:`, err.message);
        db.run('INSERT INTO sms_logs (student_id, guardian_contact, message, status, provider) VALUES (?, ?, ?, ?, ?)', [studentId, phoneNumber, message, 'Failed', provider]);
        saveDatabase();
        return { success: false, provider, error: err.message };
    }
}

router.get('/logs', authenticateToken, (req, res) => {
    const db = getDb();
    const logs = rowsToObjects(db.exec("SELECT sl.*, s.first_name, s.last_name, s.middle_name FROM sms_logs sl JOIN students s ON sl.student_id = s.id ORDER BY sl.sent_at DESC LIMIT 200"));
    res.json(logs);
});

router.post('/send', authenticateToken, async (req, res) => {
    const { student_id, message } = req.body;
    if (!student_id || !message) return res.status(400).json({ error: 'Student ID and message are required.' });

    const db = getDb();
    const students = rowsToObjects(db.exec('SELECT * FROM students WHERE id = ?', [student_id]));
    if (students.length === 0) return res.status(404).json({ error: 'Student not found' });
    if (!students.guardian_contact) return res.status(400).json({ error: 'No guardian contact number on file.' });

    const result = await sendSMS(students.guardian_contact, message, students.id);
    if (result.success) res.json({ message: 'SMS sent successfully', details: result });
    else res.status(500).json({ error: 'Failed to send SMS', details: result });
});

router.post('/broadcast', authenticateToken, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const db = getDb();
    const students = rowsToObjects(db.exec("SELECT * FROM students WHERE status = 'Active' AND guardian_contact IS NOT NULL AND guardian_contact != ''"));

    let sent = 0, failed = 0;
    for (const student of students) {
        const personalMsg = message.replace('{name}', `${student.first_name} ${student.last_name}`);
        const result = await sendSMS(student.guardian_contact, personalMsg, student.id);
        if (result.success) sent++; else failed++;
    }

    res.json({ message: 'Broadcast complete', total: students.length, sent, failed });
});

router.get('/stats', authenticateToken, (req, res) => {
    const db = getDb();
    const total = db.exec('SELECT COUNT(*) FROM sms_logs').values;
    const sent = db.exec("SELECT COUNT(*) FROM sms_logs WHERE status = 'Sent'").values;
    const failed = db.exec("SELECT COUNT(*) FROM sms_logs WHERE status = 'Failed'").values;
    const today = db.exec("SELECT COUNT(*) FROM sms_logs WHERE DATE(sent_at) = DATE('now')").values;
    res.json({ total, sent, failed, today });
});

module.exports = router;
module.exports.sendSMS = sendSMS;
