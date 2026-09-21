
var express = require('express');
var router = express.Router();
var db = require('../database/db');
var auth = require('../middleware/auth');

// GET summary for dashboard
router.get('/summary', auth, function(req, res) {
    try {
        var today = new Date().toISOString().split('T')[0];
        var totalStudents = db.get('SELECT COUNT(*) as count FROM students', []).count || 0;
        var maleCount = db.get("SELECT COUNT(*) as count FROM students WHERE gender = 'Male'", []).count || 0;
        var femaleCount = db.get("SELECT COUNT(*) as count FROM students WHERE gender = 'Female'", []).count || 0;
        var todayPresent = db.get("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND (status = 'Present' OR status = 'Late')", [today]).count || 0;
        var todayAbsent = totalStudents - todayPresent;
        var attendanceRate = totalStudents > 0 ? ((todayPresent / totalStudents) * 100).toFixed(1) : '0.0';

        res.json({
            total_students: totalStudents,
            male: maleCount,
            female: femaleCount,
            today_present: todayPresent,
            today_absent: todayAbsent,
            attendance_rate: attendanceRate
        });
    } catch (err) {
        console.error('Summary error:', err);
        res.status(500).json({ error: 'Failed to load summary' });
    }
});

// GET SF2 report data
router.get('/report', auth, function(req, res) {
    try {
        var month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        var year = parseInt(req.query.year) || new Date().getFullYear();

        var students = db.all("SELECT * FROM students ORDER BY gender ASC, last_name ASC", []);
        var monthStr = year + '-' + (month < 10 ? '0' + month : month);
        var attendance = db.all("SELECT * FROM attendance WHERE date LIKE ?", [monthStr + '%']);

        var attendanceMap = {};
        for (var i = 0; i < attendance.length; i++) {
            var a = attendance[i];
            if (!attendanceMap[a.student_id]) attendanceMap[a.student_id] = {};
            attendanceMap[a.student_id][a.date] = a.status;
        }

        var daysInMonth = new Date(year, month, 0).getDate();
        var males = [];
        var females = [];

        for (var j = 0; j < students.length; j++) {
            var s = students[j];
            var fullName = s.last_name + ', ' + s.first_name + (s.middle_name ? ' ' + s.middle_name : '');
            var dailyAttendance = {};
            var totalPresent = 0;
            var totalAbsent = 0;

            for (var d = 1; d <= daysInMonth; d++) {
                var dateStr = year + '-' + (month < 10 ? '0' + month : month) + '-' + (d < 10 ? '0' + d : d);
                var dayOfWeek = new Date(year, month - 1, d).getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) { dailyAttendance[d] = 'weekend'; continue; }
                if (attendanceMap[s.id] && attendanceMap[s.id][dateStr]) {
                    var status = attendanceMap[s.id][dateStr];
                    if (status === 'Present' || status === 'Late') { dailyAttendance[d] = 'present'; totalPresent++; }
                    else { dailyAttendance[d] = 'absent'; totalAbsent++; }
                } else { dailyAttendance[d] = 'no_record'; }
            }

            var studentData = { id: s.id, name: fullName, first_name: s.first_name, middle_name: s.middle_name, last_name: s.last_name, gender: s.gender, lrn: s.lrn, daily: dailyAttendance, total_present: totalPresent, total_absent: totalAbsent };
            if (s.gender === 'Male') males.push(studentData);
            else females.push(studentData);
        }

        var schoolDays = 0;
        for (var sd = 1; sd <= daysInMonth; sd++) {
            var dow = new Date(year, month - 1, sd).getDay();
            if (dow !== 0 && dow !== 6) schoolDays++;
        }

        var malePresentTotal = 0, maleAbsentTotal = 0;
        for (var m = 0; m < males.length; m++) { malePresentTotal += males[m].total_present; maleAbsentTotal += males[m].total_absent; }
        var femalePresentTotal = 0, femaleAbsentTotal = 0;
        for (var f = 0; f < females.length; f++) { femalePresentTotal += females[f].total_present; femaleAbsentTotal += females[f].total_absent; }

        var totalPresentAll = malePresentTotal + femalePresentTotal;
        var totalAbsentAll = maleAbsentTotal + femaleAbsentTotal;
        var overallRate = (males.length + females.length) * schoolDays > 0 ? ((totalPresentAll / ((males.length + females.length) * schoolDays)) * 100).toFixed(1) : '0.0';

        res.json({
            month: month, year: year, school_days: schoolDays, days_in_month: daysInMonth,
            males: males, females: females,
            summary: { total_students: males.length + females.length, male_count: males.length, female_count: females.length, male_present: malePresentTotal, male_absent: maleAbsentTotal, female_present: femalePresentTotal, female_absent: femaleAbsentTotal, total_present: totalPresentAll, total_absent: totalAbsentAll, attendance_rate: overallRate },
            school_info: { school_id: '102056', school_name: 'Sta. Rosa ES', grade: '6', section: 'Great Geniuses', school_year: '2025-2026', adviser: 'Tifanny Martin Aragon', school_head: 'MC Riz Templeton Buen' }
        });
    } catch (err) {
        console.error('SF2 report error:', err);
        res.status(500).json({ error: 'Failed to generate SF2 report' });
    }
});

// GET download SF2 as Excel
router.get('/download', auth, function(req, res) {
    try {
        var ExcelJS = require('exceljs');
        var month = parseInt(req.query.month) || (new Date().getMonth() + 1);
        var year = parseInt(req.query.year) || new Date().getFullYear();
        var months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var monthName = months[month];

        var students = db.all("SELECT * FROM students ORDER BY gender ASC, last_name ASC", []);
        var males = students.filter(function(s) { return s.gender === 'Male'; });
        var females = students.filter(function(s) { return s.gender === 'Female'; });

        var monthStr = year + '-' + (month < 10 ? '0' + month : month);
        var attendance = db.all("SELECT * FROM attendance WHERE date LIKE ?", [monthStr + '%']);
        var attendanceMap = {};
        for (var i = 0; i < attendance.length; i++) {
            var a = attendance[i];
            if (!attendanceMap[a.student_id]) attendanceMap[a.student_id] = {};
            attendanceMap[a.student_id][a.date] = a.status;
        }

        var daysInMonth = new Date(year, month, 0).getDate();
        var workbook = new ExcelJS.Workbook();
        var sheet = workbook.addWorksheet(monthName);

        sheet.mergeCells('A1:AH1');
        sheet.getCell('A1').value = 'School Form 2 (SF2) Daily Attendance Report of Learners';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        sheet.getCell('A1').alignment = { horizontal: 'center' };

        sheet.mergeCells('A2:AH2');
        sheet.getCell('A2').value = '(This replaces Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)';
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getCell('A2').font = { size: 9, italic: true };

        sheet.getCell('A3').value = 'School ID:'; sheet.getCell('F3').value = '102056';
        sheet.getCell('A4').value = 'School Name:'; sheet.getCell('F4').value = 'Sta. Rosa ES';
        sheet.getCell('L3').value = 'Grade:'; sheet.getCell('N3').value = '6';
        sheet.getCell('L4').value = 'Section:'; sheet.getCell('N4').value = 'Great Geniuses';
        sheet.getCell('T3').value = 'School Year:'; sheet.getCell('V3').value = '2025-2026';
        sheet.getCell('T4').value = 'Month:'; sheet.getCell('V4').value = monthName + ' ' + year;

        var headerRow = 6;
        sheet.getCell('A' + headerRow).value = 'No.';
        sheet.getCell('B' + headerRow).value = 'NAME (Last Name, First Name, Middle Name)';
        for (var d = 1; d <= daysInMonth; d++) {
            sheet.getCell(headerRow, d + 2).value = d;
            sheet.getCell(headerRow, d + 2).alignment = { horizontal: 'center' };
            sheet.getCell(headerRow, d + 2).font = { bold: true, size: 9 };
        }
        var totalCol = daysInMonth + 3;
        sheet.getCell(headerRow, totalCol).value = 'TOTAL PRESENT';
        sheet.getCell(headerRow, totalCol + 1).value = 'TOTAL ABSENT';

        var row = headerRow + 1;
        sheet.getCell('A' + row).value = 'MALE'; sheet.getCell('A' + row).font = { bold: true, color: { argb: 'FF0000FF' } }; row++;

        for (var mi = 0; mi < males.length; mi++) {
            var ms = males[mi];
            sheet.getCell('A' + row).value = mi + 1;
            sheet.getCell('B' + row).value = ms.last_name + ', ' + ms.first_name + (ms.middle_name ? ' ' + ms.middle_name : '');
            var mPresent = 0, mAbsent = 0;
            for (var md = 1; md <= daysInMonth; md++) {
                var dateStr = year + '-' + (month < 10 ? '0' + month : month) + '-' + (md < 10 ? '0' + md : md);
                var dayOfWeek = new Date(year, month - 1, md).getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) { sheet.getCell(row, md + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; }
                else if (attendanceMap[ms.id] && attendanceMap[ms.id][dateStr]) {
                    if (attendanceMap[ms.id][dateStr] === 'Present' || attendanceMap[ms.id][dateStr] === 'Late') { sheet.getCell(row, md + 2).value = '\u2713'; sheet.getCell(row, md + 2).font = { color: { argb: 'FF00B050' } }; mPresent++; }
                    else { sheet.getCell(row, md + 2).value = 'X'; sheet.getCell(row, md + 2).font = { color: { argb: 'FFFF0000' } }; mAbsent++; }
                }
                sheet.getCell(row, md + 2).alignment = { horizontal: 'center' };
            }
            sheet.getCell(row, totalCol).value = mPresent; sheet.getCell(row, totalCol + 1).value = mAbsent; row++;
        }

        sheet.getCell('A' + row).value = 'FEMALE'; sheet.getCell('A' + row).font = { bold: true, color: { argb: 'FFFF00FF' } }; row++;

        for (var fi = 0; fi < females.length; fi++) {
            var fs = females[fi];
            sheet.getCell('A' + row).value = fi + 1;
            sheet.getCell('B' + row).value = fs.last_name + ', ' + fs.first_name + (fs.middle_name ? ' ' + fs.middle_name : '');
            var fPresent = 0, fAbsent = 0;
            for (var fd = 1; fd <= daysInMonth; fd++) {
                var fDateStr = year + '-' + (month < 10 ? '0' + month : month) + '-' + (fd < 10 ? '0' + fd : fd);
                var fDayOfWeek = new Date(year, month - 1, fd).getDay();
                if (fDayOfWeek === 0 || fDayOfWeek === 6) { sheet.getCell(row, fd + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; }
                else if (attendanceMap[fs.id] && attendanceMap[fs.id][fDateStr]) {
                    if (attendanceMap[fs.id][fDateStr] === 'Present' || attendanceMap[fs.id][fDateStr] === 'Late') { sheet.getCell(row, fd + 2).value = '\u2713'; sheet.getCell(row, fd + 2).font = { color: { argb: 'FF00B050' } }; fPresent++; }
                    else { sheet.getCell(row, fd + 2).value = 'X'; sheet.getCell(row, fd + 2).font = { color: { argb: 'FFFF0000' } }; fAbsent++; }
                }
                sheet.getCell(row, fd + 2).alignment = { horizontal: 'center' };
            }
            sheet.getCell(row, totalCol).value = fPresent; sheet.getCell(row, totalCol + 1).value = fAbsent; row++;
        }

        row++;
        sheet.getCell('A' + row).value = 'SUMMARY'; sheet.getCell('A' + row).font = { bold: true }; row++;
        sheet.getCell('A' + row).value = 'Total Students: ' + (males.length + females.length);
        sheet.getCell('L' + row).value = 'Male: ' + males.length;
        sheet.getCell('T' + row).value = 'Female: ' + females.length;
        row += 2;
        sheet.getCell('A' + row).value = 'Prepared by:';
        sheet.getCell('A' + (row + 2)).value = 'TIFANNY MARTIN ARAGON'; sheet.getCell('A' + (row + 3)).value = 'Class Adviser';
        sheet.getCell('T' + row).value = 'Certified Correct:';
        sheet.getCell('T' + (row + 2)).value = 'MC RIZ TEMPLETON BUEN'; sheet.getCell('T' + (row + 3)).value = 'School Head';

        sheet.getColumn(1).width = 5; sheet.getColumn(2).width = 35;
        for (var cw = 3; cw <= daysInMonth + 2; cw++) { sheet.getColumn(cw).width = 4; }
        sheet.getColumn(totalCol).width = 14; sheet.getColumn(totalCol + 1).width = 14;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=SF2_' + monthName + '_' + year + '_Grade6_GreatGeniuses.xlsx');
        workbook.xlsx.write(res).then(function() { res.end(); });
    } catch (err) {
        console.error('SF2 download error:', err);
        res.status(500).json({ error: 'Failed to download SF2 report' });
    }
});

module.exports = router;

