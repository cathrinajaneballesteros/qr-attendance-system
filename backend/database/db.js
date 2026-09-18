
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db;
const DB_PATH = path.join(__dirname, 'attendance.db');

async function initDatabase() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT DEFAULT 'teacher', school TEXT DEFAULT 'Sta. Rosa ES', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

    db.run("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, lrn TEXT, last_name TEXT NOT NULL, first_name TEXT NOT NULL, middle_name TEXT, gender TEXT, section TEXT DEFAULT 'Great Geniuses', grade_level TEXT DEFAULT 'Grade 6', guardian_name TEXT, guardian_contact TEXT, qr_code TEXT, status TEXT DEFAULT 'Active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

    db.run("CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT DEFAULT 'Present', time_in TEXT, remarks TEXT, recorded_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id, date))");

    db.run("CREATE TABLE IF NOT EXISTS sms_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, guardian_contact TEXT NOT NULL, message TEXT NOT NULL, status TEXT DEFAULT 'Sent', provider TEXT, sent_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

    // Seed admin
    const adminCheck = query("SELECT id FROM users WHERE username = 'admin'");
    if (adminCheck.length === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", ['admin', hash, 'System Administrator', 'admin']);
        console.log('✅ Default admin created → username: admin | password: admin123');
    }

    // Seed teacher
    const teacherCheck = query("SELECT id FROM users WHERE username = 'teacher'");
    if (teacherCheck.length === 0) {
        const hash = bcrypt.hashSync('teacher123', 10);
        db.run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", ['teacher', hash, 'Tifanny Martin Aragon', 'teacher']);
        console.log('✅ Default teacher created → username: teacher | password: teacher123');
    }

    // Seed 24 students from SF2
    const countCheck = query("SELECT COUNT(*) as count FROM students");
    if (countCheck.length === 0 || countCheck[0].count === 0) {
        const students = [
            ['ANIN','ANGELITO','LAPITAN','Male','09171234501','Mrs. Anin'],
            ['CALLENA','KHALED','GAYAP','Male','09171234502','Mrs. Callena'],
            ['DOTIMAS','IVAN','VILLAMOR','Male','09171234503','Mrs. Dotimas'],
            ['DOTIMAS','JHON','PADILLA','Male','09171234504','Mrs. Dotimas'],
            ['GAYAP','JUSTINE','BLACE','Male','09171234505','Mrs. Gayap'],
            ['HERANI','ANTHONY JR','QUINTERO','Male','09171234506','Mrs. Herani'],
            ['LAPITAN','GIDEON','NATIVIDAD','Male','09171234507','Mrs. Lapitan'],
            ['LAPITAN','YAEL','NATIVIDAD','Male','09171234508','Mrs. Lapitan'],
            ['LUMONTAD','CHRISTIAN','MANIBOY','Male','09171234509','Mrs. Lumontad'],
            ['PACHOCA','JOHN ROBERT','DELA CRUZ','Male','09171234510','Mrs. Pachoca'],
            ['PULANCO','JERALD','GULOY','Male','09171234511','Mrs. Pulanco'],
            ['SORIANO','MARK ANGELO','GAYAP','Male','09171234512','Mrs. Soriano'],
            ['AGOTO','MILAGROS','RINGOR','Female','09171234513','Mrs. Agoto'],
            ['ANCHETA','KRISTINE','HALOG','Female','09171234514','Mrs. Ancheta'],
            ['CARIAGA','ANGEL','BESTROLLO','Female','09171234515','Mrs. Cariaga'],
            ['DELOS TRINOS','JANNAH ROSE','ROBRIGADO','Female','09171234516','Mrs. Delos Trinos'],
            ['ESTRADA','RHIAN','VIERNES','Female','09171234517','Mrs. Estrada'],
            ['GAYAP','DARLYN FAITH','CAÑAS','Female','09171234518','Mrs. Gayap'],
            ['GAYAP','JOHANNA','BLACE','Female','09171234519','Mrs. Gayap'],
            ['LAUREANO','PRINCESS','GAYAP','Female','09171234520','Mrs. Laureano'],
            ['LINDE','ERICA MAY','GARBON','Female','09171234521','Mrs. Linde'],
            ['NATIVIDAD','ALEXIES','UDARBE','Female','09171234522','Mrs. Natividad'],
            ['SINGH','NAMI SHANAIAH','OBEDOZA','Female','09171234523','Mrs. Singh'],
            ['VILLANUEVA','KIESHA FAITH','PULANCO','Female','09171234524','Mrs. Villanueva']
        ];
        for (const s of students) {
            db.run("INSERT INTO students (last_name, first_name, middle_name, gender, guardian_contact, guardian_name) VALUES (?, ?, ?, ?, ?, ?)", s);
        }
        console.log('✅ Seeded 24 students from SF2 data');
    }

    saveDatabase();
    console.log('✅ Database initialized successfully');
}

function query(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) {
            stmt.bind(params);
        }
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (err) {
        console.error('Query error:', err.message, 'SQL:', sql);
        return [];
    }
}

function run(sql, params = []) {
    try {
        db.run(sql, params);
        saveDatabase();
    } catch (err) {
        console.error('Run error:', err.message, 'SQL:', sql);
    }
}

function saveDatabase() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
        console.error('Save error:', err.message);
    }
}

module.exports = { initDatabase, query, run, saveDatabase };

