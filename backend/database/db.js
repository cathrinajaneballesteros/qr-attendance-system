
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

var db = null;
var dbPath = path.join(__dirname, '..', 'attendance.db');

function saveDB() {
    if (db) {
        var data = db.export();
        var buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

setInterval(function() { saveDB(); }, 30000);

async function initDatabase() {
    var SQL = await initSqlJs();

    if (fs.existsSync(dbPath)) {
        var fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
        console.log('Loaded existing database');
    } else {
        db = new SQL.Database();
        console.log('Created new database');
    }

    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'teacher', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, lrn TEXT, full_name TEXT NOT NULL, sex TEXT, guardian_name TEXT, guardian_contact TEXT, qr_code TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, date TEXT, time_in TEXT, status TEXT DEFAULT 'present', recorded_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS sms_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, guardian_contact TEXT, message TEXT, status TEXT DEFAULT 'sent', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS sf2_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, school_year TEXT, progress_data TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

    var adminCheck = db.exec("SELECT id FROM users WHERE username = 'admin'");
    if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
        var hashedAdmin = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, ?)", ['Administrator', 'admin', hashedAdmin, 'admin']);
        console.log('Default admin created: admin / admin123');
    }

    var teacherCheck = db.exec("SELECT id FROM users WHERE username = 'teacher'");
    if (teacherCheck.length === 0 || teacherCheck[0].values.length === 0) {
        var hashedTeacher = bcrypt.hashSync('teacher123', 10);
        db.run("INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, ?)", ['Tifanny Martin Aragon', 'teacher', hashedTeacher, 'teacher']);
        console.log('Default teacher created: teacher / teacher123');
    }

    var studentCheck = db.exec("SELECT COUNT(*) as count FROM students");
    var studentCount = studentCheck[0].values[0][0];
    if (studentCount === 0) {
        var males = [
            'ANIN, ANGELITO LAPITAN',
            'CALLENA, KHALED GAYAP',
            'DOTIMAS, IVAN VILLAMOR',
            'DOTIMAS, JHON PADILLA',
            'GAYAP, JUSTINE BLACE',
            'HERANI, ANTHONY JR QUINTERO',
            'LAPITAN, GIDEON NATIVIDAD',
            'LAPITAN, YAEL NATIVIDAD',
            'LUMONTAD, CHRISTIAN MANIBOY',
            'PACHOCA, JOHN ROBERT DELA CRUZ',
            'PULANCO, JERALD GULOY',
            'SORIANO, MARK ANGELO GAYAP'
        ];
        var females = [
            'AGOTO, MILAGROS RINGOR',
            'ANCHETA, KRISTINE HALOG',
            'CARIAGA, ANGEL BESTROLLO',
            'DELOS TRINOS, JANNAH ROSE ROBRIGADO',
            'ESTRADA, RHIAN VIERNES',
            'GAYAP, DARLYN FAITH CANAS',
            'GAYAP, JOHANNA BLACE',
            'LAUREANO, PRINCESS GAYAP',
            'LINDE, ERICA MAY GARBON',
            'NATIVIDAD, ALEXIES UDARBE',
            'SINGH, NAMI SHANAIAH OBEDOZA',
            'VILLANUEVA, KIESHA FAITH PULANCO',
            'VILORIA, JHAIREEN ANTHONET DELA CRUZ'
        ];
        for (var i = 0; i < males.length; i++) {
            var qr = 'QR-' + males[i].replace(/[^A-Z]/g, '').substring(0, 12) + '-M' + (i + 1);
            db.run("INSERT INTO students (full_name, sex, qr_code) VALUES (?, ?, ?)", [males[i], 'M', qr]);
        }
        for (var j = 0; j < females.length; j++) {
            var qr2 = 'QR-' + females[j].replace(/[^A-Z]/g, '').substring(0, 12) + '-F' + (j + 1);
            db.run("INSERT INTO students (full_name, sex, qr_code) VALUES (?, ?, ?)", [females[j], 'F', qr2]);
        }
        console.log('Seeded ' + (males.length + females.length) + ' students from SF2');
    }

    saveDB();
    console.log('Database initialized');
    return wrapDatabase(db);
}

function wrapDatabase(sqlDb) {
    return {
        prepare: function(sql) {
            return {
                get: function() {
                    var args = Array.prototype.slice.call(arguments);
                    try {
                        var stmt = sqlDb.prepare(sql);
                        if (args.length > 0) stmt.bind(args);
                        if (stmt.step()) { var row = stmt.getAsObject(); stmt.free(); return row; }
                        stmt.free();
                        return undefined;
                    } catch(e) { console.log('DB get error:', e.message); return undefined; }
                },
                all: function() {
                    var args = Array.prototype.slice.call(arguments);
                    try {
                        var results = [];
                        var stmt = sqlDb.prepare(sql);
                        if (args.length > 0) stmt.bind(args);
                        while (stmt.step()) { results.push(stmt.getAsObject()); }
                        stmt.free();
                        return results;
                    } catch(e) { console.log('DB all error:', e.message); return []; }
                },
                run: function() {
                    var args = Array.prototype.slice.call(arguments);
                    try {
                        if (args.length > 0) { sqlDb.run(sql, args); } else { sqlDb.run(sql); }
                        saveDB();
                        var lastId = sqlDb.exec("SELECT last_insert_rowid()");
                        return { lastInsertRowid: lastId[0].values[0][0] };
                    } catch(e) { console.log('DB run error:', e.message); return { lastInsertRowid: 0 }; }
                }
            };
        },
        exec: function(sql) { sqlDb.run(sql); saveDB(); },
        pragma: function() {}
    };
}

module.exports = { initDatabase: initDatabase };

