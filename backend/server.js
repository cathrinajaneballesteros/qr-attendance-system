const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

const frontendCandidates = [
  path.resolve(__dirname, '..', 'frontend'),
  path.resolve(__dirname, 'frontend'),
  path.resolve(process.cwd(), 'frontend'),
  path.resolve(process.cwd(), '..', 'frontend')
];

const frontendPath =
  frontendCandidates.find(folder =>
    fs.existsSync(path.join(folder, 'index.html')) &&
    fs.existsSync(path.join(folder, 'student-portal.html'))
  ) ||
  frontendCandidates.find(folder =>
    fs.existsSync(path.join(folder, 'index.html'))
  ) ||
  frontendCandidates[0];

console.log('Frontend directory:', frontendPath);
console.log(
  'Student portal file found:',
  fs.existsSync(path.join(frontendPath, 'student-portal.html'))
);

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

app.get('/student-portal.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const portalFile = path.join(frontendPath, 'student-portal.html');

  if (!fs.existsSync(portalFile)) {
    console.error('Student portal file not found at:', portalFile);
    return res.status(404).send(
      'Student portal file not found. Check the Render log for the frontend directory.'
    );
  }

  res.sendFile(portalFile);
});

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

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

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