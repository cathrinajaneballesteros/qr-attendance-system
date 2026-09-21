
var initSqlJs = require('sql.js');
var bcrypt = require('bcryptjs');
var path = require('path');
var fs = require('fs');

var db = null;
var dbPath = path.join(__dirname, 'attendance.db');

// Helper: run a query (INSERT, UPDATE, DELETE)
function run(sql, params) {
    if (!params) params = [];
    db.run(sql, params);
    saveDb();
    return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0].values[0][0] };
}

// Helper: get one row
function get(sql, params) {
    if (!params) params = [];
    var stmt = db.prepare(sql);
    stmt.bind(params);
    var result = null;
    if (stmt.step()) {
        var cols = stmt.getColumnNames();
        var vals = stmt.get();
        result = {};
        for (var i = 0; i < cols.length; i++) {
            result[cols[i]] = vals[i];
        }
    }
    stmt.free();
    return result;
}

// Helper: get all rows
function all(sql, params) {
    if (!params) params = [];
    var stmt = db.prepare(sql);
    stmt.bind(params);
    var results = [];
    while (stmt.step()) {
        var cols = stmt.getColumnNames();
        var vals = stmt.get();
        var row = {};
        for (var i = 0; i < cols.length; i++) {
            row[cols[i]] = vals[i];
        }
        results.push(row);
    }
    stmt.free();
    return results;
}

// Save database to file
function saveDb() {
    try {
        var data = db.export();
        var buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (err) {
        console.error('Error saving database:', err);
    }
}

// Initialize database
async function initDatabase() {
    var SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        try {
            var fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
            console.log('Loaded existing database');
        } catch (err) {
            console.log('Creating new database (old file corrupted)');
            db = new SQL.Database();
        }
    } else {
        db = new SQL.Database();
        console.log('Created new database');
    }

    // Create tables
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT DEFAULT 'teacher', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, lrn TEXT, first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL, gender TEXT NOT NULL, guardian_name TEXT, guardian_phone TEXT, qr_code TEXT, assigned_teacher INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT DEFAULT 'Present', time_in TEXT, time_out TEXT, recorded_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id, date))");
    db.run("CREATE TABLE IF NOT EXISTS sms_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, phone_number TEXT, message TEXT, status TEXT DEFAULT 'sent', provider TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

    // Seed admin
    var adminExists = get('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        var adminHash = bcrypt.hashSync('admin123', 10);
        run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)', ['admin', adminHash, 'System Administrator', 'admin']);
        console.log('Default admin created -> username: admin, password: admin123');
    }

    // Seed teacher
    var teacherExists = get('SELECT id FROM users WHERE username = ?', ['tifanny']);
    if (!teacherExists) {
        var teacherHash = bcrypt.hashSync('teacher123', 10);
        run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)', ['tifanny', teacherHash, 'Tifanny Martin Aragon', 'teacher']);
        console.log('Teacher created -> username: tifanny, password: teacher123');
    }

    // Get teacher ID
    var teacherUser = get('SELECT id FROM users WHERE username = ?', ['tifanny']);
    var teacherId = teacherUser ? teacherUser.id : null;

    // Seed 25 students
    var studentCount = get('SELECT COUNT(*) as count FROM students', []);
    if (studentCount.count === 0) {
        var students = [
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

        for (var i = 0; i < students.length; i++) {
            var s = students[i];
            var qrCode = s.first_name + ' ' + s.last_name;
            run('INSERT INTO students (first_name, middle_name, last_name, gender, qr_code, assigned_teacher) VALUES (?, ?, ?, ?, ?, ?)', [s.first_name, s.middle_name, s.last_name, s.gender, qrCode, teacherId]);
        }
        console.log('Seeded 25 students (12 Male, 13 Female) assigned to teacher Tifanny Martin Aragon');
    }

    saveDb();
    console.log('Database initialized successfully');
}

module.exports = {
    initDatabase: initDatabase,
    run: run,
    get: get,
    all: all
};

