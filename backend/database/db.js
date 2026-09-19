
var Database = require('better-sqlite3');
var bcrypt = require('bcryptjs');
var path = require('path');

var dbPath = path.join(__dirname, 'attendance.db');
var db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// Create tables
db.exec("\
    CREATE TABLE IF NOT EXISTS users (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        username TEXT UNIQUE NOT NULL,\
        password TEXT NOT NULL,\
        full_name TEXT NOT NULL,\
        role TEXT DEFAULT 'teacher',\
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP\
    );\
\
    CREATE TABLE IF NOT EXISTS students (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        lrn TEXT,\
        first_name TEXT NOT NULL,\
        middle_name TEXT,\
        last_name TEXT NOT NULL,\
        gender TEXT NOT NULL,\
        guardian_name TEXT,\
        guardian_phone TEXT,\
        qr_code TEXT,\
        assigned_teacher INTEGER,\
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP\
    );\
\
    CREATE TABLE IF NOT EXISTS attendance (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        student_id INTEGER NOT NULL,\
        date TEXT NOT NULL,\
        status TEXT DEFAULT 'Present',\
        time_in TEXT,\
        time_out TEXT,\
        recorded_by INTEGER,\
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\
        FOREIGN KEY (student_id) REFERENCES students(id),\
        UNIQUE(student_id, date)\
    );\
\
    CREATE TABLE IF NOT EXISTS sms_logs (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        student_id INTEGER,\
        phone_number TEXT,\
        message TEXT,\
        status TEXT DEFAULT 'sent',\
        provider TEXT,\
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\
        FOREIGN KEY (student_id) REFERENCES students(id)\
    );\
");

// Seed default admin
var adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
    var adminHash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)').run('admin', adminHash, 'System Administrator', 'admin');
    console.log('Default admin created -> username: admin, password: admin123');
}

// Seed teacher Tifanny Martin Aragon
var teacherExists = db.prepare('SELECT id FROM users WHERE username = ?').get('tifanny');
if (!teacherExists) {
    var teacherHash = bcrypt.hashSync('teacher123', 10);
    db.prepare('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)').run('tifanny', teacherHash, 'Tifanny Martin Aragon', 'teacher');
    console.log('Teacher created -> username: tifanny, password: teacher123');
}

// Get teacher ID for assigning students
var teacherUser = db.prepare('SELECT id FROM users WHERE username = ?').get('tifanny');
var teacherId = teacherUser ? teacherUser.id : null;

// Seed ALL 25 students from SF2 Excel (12 Male, 13 Female)
var studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
if (studentCount === 0) {
    var students = [
        // ===== MALE STUDENTS (12) =====
        { first_name: 'ANGELITO', middle_name: 'LAPITAN', last_name: 'ANIN', gender: 'Male' },
        { first_name: 'KHALED', middle_name: 'GAYAP', last_name: 'CALLENA', gender: 'Male' },
        { first_name: 'IVAN', middle_name: 'VILLAMOR', last_name: 'DOTIMAS', gender: 'Male' },
        { first_name: 'JHON', middle_name: 'PADILLA', last_name: 'DOTIMAS', gender: 'Male' },
        { first_name: 'JUSTINE', middle_name: 'BLACE', last_name: 'GAYAP', gender: 'Male' },
        { first_name: 'ANTHONY', middle_name: 'JR QUINTERO', last_name: 'HERANI', gender: 'Male' },
        { first_name: 'GIDEON', middle_name: 'NATIVIDAD', last_name: 'LAPITAN', gender: 'Male' },
        { first_name: 'YAEL', middle_name: 'NATIVIDAD', last_name: 'LAPITAN', gender: 'Male' },
        { first_name: 'CHRISTIAN', middle_name: 'MANIBOY', last_name: 'LUMONTAD', gender: 'Male' },
        { first_name: 'JOHN ROBERT', middle_name: 'DELA CRUZ', last_name: 'PACHOCA', gender: 'Male' },
        { first_name: 'JERALD', middle_name: 'GULOY', last_name: 'PULANCO', gender: 'Male' },
        { first_name: 'MARK ANGELO', middle_name: 'GAYAP', last_name: 'SORIANO', gender: 'Male' },

        // ===== FEMALE STUDENTS (13) =====
        { first_name: 'MILAGROS', middle_name: 'RINGOR', last_name: 'AGOTO', gender: 'Female' },
        { first_name: 'KRISTINE', middle_name: 'HALOG', last_name: 'ANCHETA', gender: 'Female' },
        { first_name: 'ANGEL', middle_name: 'BESTROLLO', last_name: 'CARIAGA', gender: 'Female' },
        { first_name: 'JANNAH ROSE', middle_name: 'ROBRIGADO', last_name: 'DELOS TRINOS', gender: 'Female' },
        { first_name: 'RHIAN', middle_name: 'VIERNES', last_name: 'ESTRADA', gender: 'Female' },
        { first_name: 'DARLYN FAITH', middle_name: 'CANAS', last_name: 'GAYAP', gender: 'Female' },
        { first_name: 'JOHANNA', middle_name: 'BLACE', last_name: 'GAYAP', gender: 'Female' },
        { first_name: 'PRINCESS', middle_name: 'GAYAP', last_name: 'LAUREANO', gender: 'Female' },
        { first_name: 'ERICA MAY', middle_name: 'GARBON', last_name: 'LINDE', gender: 'Female' },
        { first_name: 'ALEXIES', middle_name: 'UDARBE', last_name: 'NATIVIDAD', gender: 'Female' },
        { first_name: 'NAMI SHANAIAH', middle_name: 'OBEDOZA', last_name: 'SINGH', gender: 'Female' },
        { first_name: 'KIESHA FAITH', middle_name: 'PULANCO', last_name: 'VILLANUEVA', gender: 'Female' },
        { first_name: 'JHAIREEN ANTHONET', middle_name: 'DELA CRUZ', last_name: 'VILORIA', gender: 'Female' }
    ];

    var insert = db.prepare('INSERT INTO students (first_name, middle_name, last_name, gender, qr_code, assigned_teacher) VALUES (?, ?, ?, ?, ?, ?)');
    for (var i = 0; i < students.length; i++) {
        var s = students[i];
        var qrCode = s.first_name + ' ' + s.last_name;
        insert.run(s.first_name, s.middle_name, s.last_name, s.gender, qrCode, teacherId);
    }
    console.log('Seeded ' + students.length + ' students (12 Male, 13 Female) assigned to teacher Tifanny Martin Aragon');
}

console.log('Database initialized successfully');

module.exports = db;

