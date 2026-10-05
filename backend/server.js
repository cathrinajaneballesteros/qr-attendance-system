const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, '..', 'frontend');

if (!process.env.JWT_SECRET) {
    console.error('Set JWT_SECRET before starting the server.');
    process.exit(1);
}

const pagesWithNavigation = new Set([
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

app.use(function addRoleBasedNavigation(req, res, next) {
    const pageName = path.basename(req.path);

    if (req.method !== 'GET' || !pagesWithNavigation.has(pageName)) {
        return next();
    }

    fs.readFile(path.join(frontendDir, pageName), 'utf8', function (error, html) {
        if (error) {
            return next();
        }

        // Remove the individual page menu; one role-specific menu is added below.
        html = html.replace(
            /<div class=["']nav-bar["'][^>]*>[\s\S]*?<\/div>/i,
            ''
        );

        const menuScript = `
<script>
(function () {
    var user = {};
    try {
        user = JSON.parse(localStorage.getItem('user') || '{}');
    } catch (error) {}

    var currentPage = location.pathname.split('/').pop();
    var adminPages = [
        'admin-dashboard.html',
        'manage-users.html',
        'submission-progress.html'
    ];
    var teacherPages = [
        'dashboard.html',
        'attendance.html',
        'students.html',
        'sf2-report.html',
        'sms-logs.html',
        'settings.html',
        'records.html'
    ];

    if (user.role === 'admin' && !adminPages.includes(currentPage)) {
        location.replace('admin-dashboard.html');
        return;
    }

    if (user.role === 'teacher' && !teacherPages.includes(currentPage)) {
        location.replace('dashboard.html');
        return;
    }

    if (user.role === 'student' && currentPage !== 'student-portal.html') {
        location.replace('student-portal.html');
        return;
    }

    var links;

    if (user.role === 'admin') {
        links = [
            ['admin-dashboard.html', 'Dashboard'],
            ['manage-users.html', 'Manage Teachers'],
            ['submission-progress.html', 'Submission Progress']
        ];
    } else if (user.role === 'student') {
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
    }

    var menu = document.createElement('div');
    menu.className = 'nav-bar';

    links.forEach(function (item) {
        var link = document.createElement('a');
        link.href = item[0];
        link.textContent = item[1];

        if (item[0] === currentPage) {
            link.classList.add('active');
        }

        menu.appendChild(link);
    });

    var logout = document.createElement('a');
    logout.href = '#';
    logout.className = 'logout-btn';
    logout.textContent = 'Logout';
    logout.addEventListener('click', function (event) {
        event.preventDefault();

        if (confirm('Are you sure you want to logout?')) {
            localStorage.clear();
            location.href = 'index.html';
        }
    });

    menu.appendChild(logout);

    var host =
        document.querySelector('.page-container, .container, main') ||
        document.body;

    host.insertBefore(menu, host.firstChild);
})();
</script>`;

        html = html.replace(/<\/body>/i, menuScript + '</body>');
        res.type('html').send(html);
    });
});

app.use(express.static(frontendDir));
app.set('JWT_SECRET', process.env.JWT_SECRET);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));

// Only admins may change submission progress.
const auth = require('./middleware/auth');
app.use('/api/sf2/progress', auth, function (req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin account required' });
    }
    next();
});
app.use('/api/sf2', require('./routes/sf2'));

app.use('/api/sms', require('./routes/sms'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/student-account', require('./routes/student-account'));

app.get('/api/health', function (req, res) {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('*', function (req, res) {
    res.sendFile(path.join(frontendDir, 'index.html'));
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