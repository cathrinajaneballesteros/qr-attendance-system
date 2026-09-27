
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/report', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var month = req.query.month || new Date().toISOString().substring(0, 7);
        var students = db.prepare('SELECT * FROM students ORDER BY sex, full_name').all();
        var attendance = db.prepare("SELECT a.*, s.full_name, s.sex FROM attendance a JOIN students s ON a.student_id = s.id WHERE a.date LIKE ?").all(month + '%');

        var attendanceMap = {};
        for (var i = 0; i < attendance.length; i++) {
            var rec = attendance[i];
            if (!attendanceMap[rec.student_id]) attendanceMap[rec.student_id] = {};
            var day = parseInt(rec.date.split('-')[2]);
            attendanceMap[rec.student_id][day] = rec.status;
        }

        var maleStudents = [];
        var femaleStudents = [];
        for (var s = 0; s < students.length; s++) {
            var st = students[s];
            var record = { id: st.id, name: st.full_name, sex: st.sex, attendance: attendanceMap[st.id] || {} };
            if (st.sex === 'M') maleStudents.push(record);
            else femaleStudents.push(record);
        }

        res.json({ month: month, male: maleStudents, female: femaleStudents, total: students.length });
    } catch (error) {
        console.log('SF2 report error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/summary', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var today = new Date().toISOString().split('T')[0];
        var totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get();
        var presentToday = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE date = ?').get(today);
        var total = totalStudents ? totalStudents.count : 0;
        var present = presentToday ? presentToday.count : 0;
        res.json({ total_students: total, present_today: present, absent_today: total - present, attendance_rate: total > 0 ? Math.round((present / total) * 100) : 0 });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/download', auth, function(req, res) {
    try {
        var ExcelJS = require('exceljs');
        var db = req.app.get('db');
        var month = req.query.month || new Date().toISOString().substring(0, 7);
        var monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var parts = month.split('-');
        var monthName = monthNames[parseInt(parts[1])] || '';
        var year = parts[0];

        var students = db.prepare('SELECT * FROM students ORDER BY sex, full_name').all();
        var attendance = db.prepare("SELECT * FROM attendance WHERE date LIKE ?").all(month + '%');
        var maleStudents = students.filter(function(s) { return s.sex === 'M'; });
        var femaleStudents = students.filter(function(s) { return s.sex === 'F'; });

        var workbook = new ExcelJS.Workbook();
        var sheet = workbook.addWorksheet('SF2 ' + monthName);

        sheet.mergeCells('A1:AH1');
        sheet.getCell('A1').value = 'School Form 2 (SF2) Daily Attendance Report of Learners';
        sheet.getCell('A1').font = { bold: true, size: 12 };
        sheet.getCell('A1').alignment = { horizontal: 'center' };

        sheet.mergeCells('A2:AH2');
        sheet.getCell('A2').value = '(This replaces Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)';
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getCell('A2').font = { size: 8, italic: true };

        sheet.getCell('A3').value = 'School: Sta. Rosa ES';
        sheet.getCell('D3').value = 'School ID: 102056';
        sheet.getCell('H3').value = 'School Year: 2026-2027';
        sheet.getCell('N3').value = 'Grade Level: Grade 6';
        sheet.getCell('T3').value = 'Section: GREAT GENIUSES';
        sheet.getCell('Z3').value = 'Report for: ' + monthName.toUpperCase();

        var headerRow = sheet.addRow([]);
        headerRow.getCell(1).value = 'No.';
        headerRow.getCell(2).value = 'LEARNER NAME (Last, First, Middle)';
        headerRow.getCell(3).value = 'Sex';
        for (var d = 1; d <= 31; d++) { headerRow.getCell(d + 3).value = d; }
        headerRow.getCell(35).value = 'ABSENT';
        headerRow.getCell(36).value = 'PRESENT';
        headerRow.font = { bold: true, size: 8 };

        var maleLabel = sheet.addRow([]);
        maleLabel.getCell(1).value = 'MALE';
        maleLabel.font = { bold: true };

        for (var mi = 0; mi < maleStudents.length; mi++) {
            var ms = maleStudents[mi];
            var mRow = sheet.addRow([]);
            mRow.getCell(1).value = mi + 1;
            mRow.getCell(2).value = ms.full_name;
            mRow.getCell(3).value = 'M';
            var mPresent = 0;
            for (var day = 1; day <= 31; day++) {
                var dateStr = month + '-' + (day < 10 ? '0' : '') + day;
                var found = false;
                for (var a = 0; a < attendance.length; a++) {
                    if (attendance[a].student_id === ms.id && attendance[a].date === dateStr) { found = true; break; }
                }
                if (found) { mRow.getCell(day + 3).value = ''; mPresent++; }
            }
            mRow.getCell(35).value = 0;
            mRow.getCell(36).value = mPresent;
        }

        var femaleLabel = sheet.addRow([]);
        femaleLabel.getCell(1).value = 'FEMALE';
        femaleLabel.font = { bold: true };

        for (var fi = 0; fi < femaleStudents.length; fi++) {
            var fs2 = femaleStudents[fi];
            var fRow = sheet.addRow([]);
            fRow.getCell(1).value = fi + 1;
            fRow.getCell(2).value = fs2.full_name;
            fRow.getCell(3).value = 'F';
            var fPresent = 0;
            for (var day2 = 1; day2 <= 31; day2++) {
                var dateStr2 = month + '-' + (day2 < 10 ? '0' : '') + day2;
                var found2 = false;
                for (var a2 = 0; a2 < attendance.length; a2++) {
                    if (attendance[a2].student_id === fs2.id && attendance[a2].date === dateStr2) { found2 = true; break; }
                }
                if (found2) { fRow.getCell(day2 + 3).value = ''; fPresent++; }
            }
            fRow.getCell(35).value = 0;
            fRow.getCell(36).value = fPresent;
        }

        var summaryRow = sheet.addRow([]);
        summaryRow.getCell(1).value = 'TOTAL';
        summaryRow.getCell(2).value = (maleStudents.length + femaleStudents.length) + ' students';
        summaryRow.font = { bold: true };

        sheet.addRow([]);
        var adviserRow = sheet.addRow([]);
        adviserRow.getCell(2).value = 'Prepared by: TIFANNY MARTIN ARAGON (Class Adviser)';
        var headRow = sheet.addRow([]);
        headRow.getCell(2).value = 'Attested by: MC RIZ TEMPLETON BUEN (School Head)';

        sheet.getColumn(1).width = 5;
        sheet.getColumn(2).width = 35;
        sheet.getColumn(3).width = 5;
        for (var cw = 4; cw <= 34; cw++) { sheet.getColumn(cw).width = 4; }
        sheet.getColumn(35).width = 8;
        sheet.getColumn(36).width = 8;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=SF2_Report_' + monthName + '_' + year + '.xlsx');
        workbook.xlsx.write(res).then(function() { res.end(); });
    } catch (error) {
        console.log('SF2 download error:', error.message);
        res.status(500).json({ error: 'Server error generating report' });
    }
});

router.post('/progress', auth, function(req, res) {
    try {
        var db = req.app.get('db');
        var schoolYear = req.body.school_year || '2026-2027';
        var progressData = JSON.stringify(req.body.progress || {});
        var existing = db.prepare('SELECT id FROM sf2_progress WHERE school_year = ?').get(schoolYear);
        if (existing) {
            db.prepare('UPDATE sf2_progress SET progress_data = ?, updated_at = CURRENT_TIMESTAMP WHERE school_year = ?').run(progressData, schoolYear);
        } else {
            db.prepare('INSERT INTO sf2_progress (school_year, progress_data) VALUES (?, ?)').run(schoolYear, progressData);
        }
        res.json({ message: 'Progress saved' });
    } catch (error) {
        console.log('Save progress error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

