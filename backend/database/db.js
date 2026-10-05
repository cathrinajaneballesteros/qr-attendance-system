const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db = null;
const dbPath = path.join(__dirname, '..', 'attendance.db');

function saveDB() {
  if (!db) return;
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

setInterval(saveDB, 30000);

function ensureColumn(table, column, definition) {
  const result = db.exec('PRAGMA table_info(' + table + ')');
  const columns = result.length
    ? result[0].values.map(row => row[1])
    : [];

  if (!columns.includes(column)) {
    db.run('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
    console.log('Added database column:', table + '.' + column);
  }
}

function createTablesAndMigrate() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      student_id INTEGER,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'teacher',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lrn TEXT,
      full_name TEXT NOT NULL,
      sex TEXT,
      guardian_name TEXT,
      guardian_contact TEXT,
      student_phone TEXT,
      email TEXT,
      qr_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      date TEXT,
      time_in TEXT,
      status TEXT DEFAULT 'present',
      recorded_by TEXT,
      latitude REAL,
      longitude REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sms_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      guardian_contact TEXT,
      message TEXT,
      status TEXT DEFAULT 'sent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sf2_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_year TEXT,
      progress_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notification_events (
      event_key TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS student_absence_days (
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      PRIMARY KEY (student_id, date)
    )
  `);

  // Add these to older tables without deleting existing rows.
  ensureColumn('users', 'email', 'TEXT');
  ensureColumn('users', 'student_id', 'INTEGER');
  ensureColumn('students', 'student_phone', 'TEXT');
  ensureColumn('students', 'email', 'TEXT');
  ensureColumn('attendance', 'latitude', 'REAL');
  ensureColumn('attendance', 'longitude', 'REAL');

  const defaults = {
    gps_enabled: '0',
    attendance_mode: 'onsite',
    school_latitude: '',
    school_longitude: '',
    geofence_radius_m: '100',
    qr_enabled: '1',
    qr_start: '',
    qr_end: '',
    school_start: '08:00',
    attendance_deadline: '16:00',
    absence_threshold: '5',
    late_after: '08:00',
    sms_enabled: '0'
  };

  for (const [key, value] of Object.entries(defaults)) {
    db.run(
      'INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
      [key, value]
    );
  }
}

function addOriginalSampleStudentsIfEmpty() {
  const result = db.exec('SELECT COUNT(*) FROM students');
  const count = result[0].values[0][0];

  if (count > 0) return;

  const males = [
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

  const females = [
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

  males.forEach((name, index) => {
    const qr = 'QR-' + name.replace(/[^A-Z]/g, '').substring(0, 12) + '-M' + (index + 1);
    db.run(
      'INSERT INTO students (full_name, sex, qr_code) VALUES (?, ?, ?)',
      [name, 'M', qr]
    );
  });

  females.forEach((name, index) => {
    const qr = 'QR-' + name.replace(/[^A-Z]/g, '').substring(0, 12) + '-F' + (index + 1);
    db.run(
      'INSERT INTO students (full_name, sex, qr_code) VALUES (?, ?, ?)',
      [name, 'F', qr]
    );
  });

  console.log('Restored the 25 original sample students');
}

function createDefaultAccountsIfMissing() {
  const admin = db.exec("SELECT id FROM users WHERE username = 'admin'");
  if (!admin.length || !admin[0].values.length) {
    db.run(
      'INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, ?)',
      ['Administrator', 'admin', bcrypt.hashSync('admin123', 10), 'admin']
    );
    console.log('Default admin account created');
  }

  const teacher = db.exec("SELECT id FROM users WHERE username = 'teacher'");
  if (!teacher.length || !teacher[0].values.length) {
    db.run(
      'INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, ?)',
      ['Tifanny Martin Aragon', 'teacher', bcrypt.hashSync('teacher123', 10), 'teacher']
    );
    console.log('Default teacher account created');
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  createTablesAndMigrate();
  createDefaultAccountsIfMissing();
  addOriginalSampleStudentsIfEmpty();

  saveDB();
  console.log('Database initialized and migrations completed');

  return wrapDatabase(db);
}

function wrapDatabase(sqlDb) {
  return {
    prepare(sql) {
      return {
        get(...args) {
          try {
            const statement = sqlDb.prepare(sql);
            if (args.length) statement.bind(args);

            if (statement.step()) {
              const row = statement.getAsObject();
              statement.free();
              return row;
            }

            statement.free();
            return undefined;
          } catch (error) {
            console.log('DB get error:', error.message);
            return undefined;
          }
        },

        all(...args) {
          try {
            const rows = [];
            const statement = sqlDb.prepare(sql);
            if (args.length) statement.bind(args);

            while (statement.step()) {
              rows.push(statement.getAsObject());
            }

            statement.free();
            return rows;
          } catch (error) {
            console.log('DB all error:', error.message);
            return [];
          }
        },

        run(...args) {
          try {
            if (args.length) {
              sqlDb.run(sql, args);
            } else {
              sqlDb.run(sql);
            }

            saveDB();

            const result = sqlDb.exec('SELECT last_insert_rowid()');
            const lastInsertRowid =
              result.length && result[0].values.length
                ? result[0].values[0][0]
                : 0;

            return { lastInsertRowid };
          } catch (error) {
            console.log('DB run error:', error.message);
            return { lastInsertRowid: 0 };
          }
        }
      };
    },

    exec(sql) {
      sqlDb.run(sql);
      saveDB();
    },

    pragma() {}
  };
}

module.exports = { initDatabase };