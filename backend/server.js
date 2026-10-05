const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('JWT_SECRET must be configured before starting the server');
  process.exit(1);
}

process.env.JWT_SECRET = JWT_SECRET;
app.set('JWT_SECRET', JWT_SECRET);

app.use(cors());
app.use(express.json());

const frontendPath = path.join(__dirname, '..', 'frontend');

// Keep every existing API route.
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/sf2', require('./routes/sf2'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/student-account', require('./routes/student-account'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve this exact file at this URL. Do not replace it with index.html.
app.get('/student-portal.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(frontendPath, 'student-portal.html'), error => {
    if (error && !res.headersSent) {
      console.error('Student portal file could not be served:', error.message);
      res.status(404).send('student-portal.html was not found in the frontend folder.');
    }
  });
});

// Serve the remaining frontend files, including CSS and JavaScript.
app.use(express.static(frontendPath, {
  setHeaders(res, filePath) {
    if (path.extname(filePath).toLowerCase() === '.html') {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Do not send the login page as the response for a missing API route.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Preserve the existing fallback for other site routes.
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

async function startServer() {
  try {
    const dbModule = require('./database/db');
    const db = await dbModule.initDatabase();

    app.set('db', db);
    require('./services/notifications').startDailyNotifier(db);

    app.listen(PORT, () => {
      console.log('Database ready');
      console.log('Server running on port ' + PORT);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();