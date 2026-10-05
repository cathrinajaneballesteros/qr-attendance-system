const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET must be configured before starting the server.');
    process.exit(1);
}

const teacherPages = new Set([
    'dashboard.html',
    'attendance.html',
    'students.html',
    'sf2-report.html',
    'sms-logs.html',
    'settings.html',
    'records.html',
    'admin-dashboard.html',
    'manage-users.html',
    'submission-progress.html',
    'student-portal.html'
]);

app.use(cors());
app.use(express.json());

/*
 * Put the same navigation on each page. This avoids maintaining
 * a different menu in every HTML file.
 */
app.use(function sharedNavigation(req, res, next) {
    const pageName = path.basename(req.path);

    if (req.method !== 'GET' || !teacherPages.has(pageName)) {
        return next();
    }

    fs.readFile(path.join(FRONTEND_DIR, pageName), 'utf8', function (error, page) {
        if (error) {
            return next();
        }

        // Remove any page-specific menu so there is only one navigation bar.
        page = page.replace(
            /<div class=["']nav-bar["'][^>]*>[\s\S]*?<\/div>/i,
            ''
        );

        const navigationScript = `
<script>
(function () {
    var user = {};
    try {
        user = JSON.parse(localStorage.getItem('user') || '{}');
    } catch (error) {}

    var links;

    if (user.role === 'student') {
        links = [
            ['student-portal.html', 'Student Portal']
        ];
    } else {
        links = [
            ['dashboard.html', 'Dashboard'],
            ['attendance.html', 'Attendance'],
            ['students.html', 'Students'],
            ['sf2-report.html', 'SF2 Report'],
            ['sms-logs.html', 'SMS Logs'],
            ['settings.html', 'Attendance Settings'],
            ['records.html', 'Download Records']
        ];

        if (user.role === 'admin') {
            links.push(['manage-users.html', 'Manage Teachers']);
            links.push(['submission-progress.html', 'Submission Progress']);
        }
    }

    var host = document.querySelector('.page-container, .container, main') || document.body;
    var nav = document.createElement('div');
    nav.className = 'nav-bar';

    links.forEach(function (item) {
        var link = document.createElement('a');
        link.href = item[0];
        link.textContent = item[1];

        if (location.pathname.split('/').pop() === item[0]) {
            link.classList.add('active');
        }

        nav.appendChild(link);
    });

    var logout = document.createElement('a');
    logout.href = '#';
    logout.textContent = 'Logout';
    logout.className = 'logout-btn';
    logout.addEventListener('click', function (event) {
        event.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            localStorage.clear();
            location.href = 'index.html';
        }
    });
    nav.appendChild(logout);

    host.insertBefore(nav, host.firstChild);
})();
</script>`;

        page = page.replace(/<\/body>/i, navigationScript + '</body>');
        res.type('html').send(page);
    });
});

app.use(express.static(FRONTEND_DIR));

app.set('JWT_SECRET', process.env.JWT_SECRET);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/sf2', require('./routes/sf2'));
app.use('/api/sms', require('./routes/sms'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/student-account', require('./routes/student-account'));

app.get('/api/health', function (req, res) {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('*', function (req, res) {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

async function startServer() {
    try {
        const dbModule = require('./database/db');
        const db = await dbModule.initDatabase();

        app.set('db', db);
        require('./services/notifications').startDailyNotifier(db);

        app.listen(PORT, function () {
            console.log('Server running on port ' + PORT);
        });
    } catch (error) {
        console.error('Failed to start:', error.message);
        process.exit(1);
    }
}

startServer();