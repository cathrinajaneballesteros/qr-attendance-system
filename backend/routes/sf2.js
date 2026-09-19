
var express = require('express');
var router = express.Router();
var db = require('../database/db');
var auth = require('../middleware/auth');

// Get SF2 summary stats
router.get('/summary', function(req, res, next) { auth(req, res, next); }, function(req, res) {
    try {
        var today = new Date().toISOString().split('T')[0];
        var totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
        var male = db.prepare("SELECT COUNT(*) as count FROM students WHERE gender = 'Male'").get().count;
        var female = db.prepare("SELECT COUNT(*) as count FROM students WHERE gender = 'Female'").get().count;
        var todayPresent = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND (status = 'Present' OR status = 'Late')").get(today);
        todayPresent = todayPresent ? todayPresent.count : 0;
        var todayAbsent = totalStudents - todayPresent;

        var totalRecords = db.prepare('SELECT COUNT(*) as count FROM attendance').get().count;
        var totalPresent = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE status = 'Present' OR status = 'Late'").get().count;
        var rate = totalRecords > 0 ? ((totalPresent / totalRecords) * 100) : 0;

        res.json({
            total_students: totalStudents,
            male: male,
            female: female,
            today_present: todayPresent,
            today_absent: todayAbsent < 0 ? 0 : todayAbsent,
            attendance_rate: rate.toFixed(1)
        });
    } catch (err) {
        console.error('SF2 summary error:', err);
        res.status(500).json({ error: 'Failed to get summary' });
    }
});

// Get SF2 report data for a specific month/year
router.get('/report', function(req, res, next) { auth(req, res, next); }, function(req, res) {
    try {
        var month = req.query.month;
        var year = req.query.year;
        var m = parseInt(month) || (new Date().getMonth() + 1);
        var y = parseInt(year) || new Date().getFullYear();

        var maleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Male' ORDER BY last_name, first_name").all();
        var femaleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Female' ORDER BY last_name, first_name").all();
        var allStudents = maleStudents.concat(femaleStudents);
        var schoolDays = getSchoolDays(y, m);

        var reportData = [];
        for (var idx = 0; idx < allStudents.length; idx++) {
            var student = allStudents[idx];
            var dailyAttendance = {};
            var totalPresent = 0;
            var totalAbsent = 0;

            for (var di = 0; di < schoolDays.length; di++) {
                var day = schoolDays[di];
                var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
                var record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);

                if (record) {
                    if (record.status === 'Present' || record.status === 'Late') {
                        dailyAttendance[day] = record.status === 'Late' ? 'L' : '';
                        totalPresent++;
                    } else {
                        dailyAttendance[day] = 'X';
                        totalAbsent++;
                    }
                } else {
                    dailyAttendance[day] = '';
                }
            }

            reportData.push({
                no: idx + 1,
                name: student.last_name + ',' + student.first_name + ', ' + (student.middle_name || ''),
                gender: student.gender,
                daily: dailyAttendance,
                total_absent: totalAbsent,
                total_present: totalPresent
            });
        }

        var maleDailyTotals = {};
        var femaleDailyTotals = {};
        for (var d1 = 0; d1 < schoolDays.length; d1++) {
            maleDailyTotals[schoolDays[d1]] = 0;
            femaleDailyTotals[schoolDays[d1]] = 0;
        }

        for (var ri = 0; ri < reportData.length; ri++) {
            var r = reportData[ri];
            for (var d2 = 0; d2 < schoolDays.length; d2++) {
                var dayKey = schoolDays[d2];
                if (r.daily[dayKey] !== 'X') {
                    if (r.gender === 'Male') maleDailyTotals[dayKey]++;
                    else femaleDailyTotals[dayKey]++;
                }
            }
        }

        var maleData = [];
        var femaleData = [];
        for (var fi = 0; fi < reportData.length; fi++) {
            if (reportData[fi].gender === 'Male') maleData.push(reportData[fi]);
            else femaleData.push(reportData[fi]);
        }

        var maleTotalPresent = 0, maleTotalAbsent = 0;
        for (var mi = 0; mi < maleData.length; mi++) {
            maleTotalPresent += maleData[mi].total_present;
            maleTotalAbsent += maleData[mi].total_absent;
        }
        var femaleTotalPresent = 0, femaleTotalAbsent = 0;
        for (var ffi = 0; ffi < femaleData.length; ffi++) {
            femaleTotalPresent += femaleData[ffi].total_present;
            femaleTotalAbsent += femaleData[ffi].total_absent;
        }

        var monthNames = ['', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        var totalPossible = allStudents.length * schoolDays.length;
        var combinedPresent = maleTotalPresent + femaleTotalPresent;
        var combinedPercentage = totalPossible > 0 ? ((combinedPresent / totalPossible) * 100).toFixed(1) : '0.0';

        res.json({
            school_id: '102056',
            school_name: 'Sta. Rosa ES',
            school_year: '2025 - 2026',
            month: monthNames[m],
            month_num: m,
            year: y,
            grade_level: 'Grade 6',
            section: 'GREAT GENIUSES',
            school_days: schoolDays,
            num_school_days: schoolDays.length,
            male_students: maleData,
            female_students: femaleData,
            male_count: maleStudents.length,
            female_count: femaleStudents.length,
            total_students: allStudents.length,
            male_daily_totals: maleDailyTotals,
            female_daily_totals: femaleDailyTotals,
            male_total_present: maleTotalPresent,
            male_total_absent: maleTotalAbsent,
            female_total_present: femaleTotalPresent,
            female_total_absent: femaleTotalAbsent,
            grand_total_present: combinedPresent,
            grand_total_absent: maleTotalAbsent + femaleTotalAbsent,
            combined_percentage: combinedPercentage,
            adviser: 'Tifanny Martin Aragon',
            school_head: 'MC Riz Templeton Buen'
        });
    } catch (err) {
        console.error('SF2 report error:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Download SF2 as Excel
router.get('/download', function(req, res, next) { auth(req, res, next); }, function(req, res) {
    try {
        var ExcelJS = require('exceljs');
        var month = req.query.month;
        var year = req.query.year;
        var m = parseInt(month) || (new Date().getMonth() + 1);
        var y = parseInt(year) || new Date().getFullYear();

        var monthNames = ['', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        var dayLabels = ['SUN', 'M', 'T', 'W', 'TH', 'F', 'SAT'];

        var maleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Male' ORDER BY last_name, first_name").all();
        var femaleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Female' ORDER BY last_name, first_name").all();
        var schoolDays = getSchoolDays(y, m);

        var workbook = new ExcelJS.Workbook();
        var ws = workbook.addWorksheet(monthNames[m]);

        ws.mergeCells('A1:AR1');
        ws.getCell('A1').value = 'School Form 2 (SF2) Daily Attendance Report of Learners';
        ws.getCell('A1').font = { bold: true, size: 14 };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        ws.mergeCells('A2:AR2');
        ws.getCell('A2').value = '(This replaces Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)';
        ws.getCell('A2').alignment = { horizontal: 'center' };
        ws.getCell('A2').font = { italic: true, size: 9 };

        ws.getCell('A3').value = 'School ID';
        ws.getCell('A3').font = { bold: true };
        ws.getCell('F3').value = '102056';
        ws.getCell('J3').value = 'School Year';
        ws.getCell('J3').font = { bold: true };
        ws.getCell('M3').value = '2025 - 2026';
        ws.getCell('S3').value = 'Report for the Month of';
        ws.getCell('S3').font = { bold: true };
        ws.getCell('AA3').value = monthNames[m];
        ws.getCell('AA3').font = { bold: true, size: 12 };

        ws.getCell('A4').value = 'Name of School';
        ws.getCell('A4').font = { bold: true };
        ws.getCell('F4').value = 'Sta. Rosa ES';
        ws.getCell('S4').value = 'Grade Level';
        ws.getCell('S4').font = { bold: true };
        ws.getCell('AA4').value = 'Grade 6';
        ws.getCell('AI4').value = 'Section';
        ws.getCell('AI4').font = { bold: true };
        ws.getCell('AL4').value = 'GREAT GENIUSES';
        ws.getCell('AL4').font = { bold: true };

        ws.getCell('A5').value = 'No.';
        ws.getCell('A5').font = { bold: true };
        ws.getCell('C5').value = 'NAME\n(Last Name, First Name, Middle Name)';
        ws.getCell('C5').font = { bold: true };
        ws.getCell('C5').alignment = { wrapText: true };

        var col = 6;
        var dayColumns = {};
        for (var si = 0; si < schoolDays.length; si++) {
            var day = schoolDays[si];
            var date = new Date(y, m - 1, day);
            var dn = dayLabels[date.getDay()];
            ws.getCell(5, col).value = day;
            ws.getCell(6, col).value = dn;
            ws.getCell(5, col).alignment = { horizontal: 'center' };
            ws.getCell(6, col).alignment = { horizontal: 'center' };
            ws.getCell(5, col).font = { bold: true, size: 8 };
            ws.getCell(6, col).font = { bold: true, size: 8 };
            dayColumns[day] = col;
            col++;
        }

        var absentCol = col;
        var presentCol = col + 1;
        ws.getCell(5, absentCol).value = 'ABSENT';
        ws.getCell(5, presentCol).value = 'PRESENT';
        ws.getCell(5, absentCol).font = { bold: true };
        ws.getCell(5, presentCol).font = { bold: true };
        ws.getCell(5, absentCol).alignment = { horizontal: 'center' };
        ws.getCell(5, presentCol).alignment = { horizontal: 'center' };

        var row = 7;
        var maleTotalPresent = 0;
        var maleTotalAbsent = 0;

        for (var mi = 0; mi < maleStudents.length; mi++) {
            var student = maleStudents[mi];
            ws.getCell('A' + row).value = mi + 1;
            ws.getCell('C' + row).value = student.last_name + ',' + student.first_name + ', ' + (student.middle_name || '');
            var absent = 0;
            var present = 0;

            for (var di = 0; di < schoolDays.length; di++) {
                var d = schoolDays[di];
                var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
                var record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);
                var c = dayColumns[d];
                if (record) {
                    if (record.status === 'Present' || record.status === 'Late') {
                        present++;
                    } else {
                        ws.getCell(row, c).value = 'X';
                        ws.getCell(row, c).font = { color: { argb: 'FFFF0000' }, bold: true };
                        absent++;
                    }
                }
                ws.getCell(row, c).alignment = { horizontal: 'center' };
            }

            ws.getCell(row, absentCol).value = absent;
            ws.getCell(row, presentCol).value = present;
            ws.getCell(row, absentCol).alignment = { horizontal: 'center' };
            ws.getCell(row, presentCol).alignment = { horizontal: 'center' };
            maleTotalPresent += present;
            maleTotalAbsent += absent;
            row++;
        }

        ws.getCell('A' + row).value = maleStudents.length;
        ws.getCell('C' + row).value = '<=== MALE | TOTAL Per Day ===>';
        ws.getCell('C' + row).font = { bold: true };
        ws.getCell(row, absentCol).value = maleTotalAbsent;
        ws.getCell(row, presentCol).value = maleTotalPresent;
        row++;

        var femaleTotalPresent = 0;
        var femaleTotalAbsent = 0;

        for (var fi = 0; fi < femaleStudents.length; fi++) {
            var fstudent = femaleStudents[fi];
            ws.getCell('A' + row).value = fi + 1;
            ws.getCell('C' + row).value = fstudent.last_name + ',' + fstudent.first_name + ', ' + (fstudent.middle_name || '');
            var fabsent = 0;
            var fpresent = 0;

            for (var fdi = 0; fdi < schoolDays.length; fdi++) {
                var fd = schoolDays[fdi];
                var fdateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(fd).padStart(2, '0');
                var frecord = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(fstudent.id, fdateStr);
                var fc = dayColumns[fd];
                if (frecord) {
                    if (frecord.status === 'Present' || frecord.status === 'Late') {
                        fpresent++;
                    } else {
                        ws.getCell(row, fc).value = 'X';
                        ws.getCell(row, fc).font = { color: { argb: 'FFFF0000' }, bold: true };
                        fabsent++;
                    }
                }
                ws.getCell(row, fc).alignment = { horizontal: 'center' };
            }

            ws.getCell(row, absentCol).value = fabsent;
            ws.getCell(row, presentCol).value = fpresent;
            ws.getCell(row, absentCol).alignment = { horizontal: 'center' };
            ws.getCell(row, presentCol).alignment = { horizontal: 'center' };
            femaleTotalPresent += fpresent;
            femaleTotalAbsent += fabsent;
            row++;
        }

        ws.getCell('A' + row).value = femaleStudents.length;
        ws.getCell('C' + row).value = '<=== FEMALE | TOTAL Per Day ===>';
        ws.getCell('C' + row).font = { bold: true };
        ws.getCell(row, absentCol).value = femaleTotalAbsent;
        ws.getCell(row, presentCol).value = femaleTotalPresent;
        row += 2;

        ws.getCell('C' + row).value = 'COMBINED TOTAL (Male + Female)';
        ws.getCell('C' + row).font = { bold: true };
        ws.getCell(row, absentCol).value = maleTotalAbsent + femaleTotalAbsent;
        ws.getCell(row, presentCol).value = maleTotalPresent + femaleTotalPresent;
        row++;

        var totalPossible = (maleStudents.length + femaleStudents.length) * schoolDays.length;
        var overallRate = totalPossible > 0 ? (((maleTotalPresent + femaleTotalPresent) / totalPossible) * 100).toFixed(1) : '0.0';
        ws.getCell('C' + row).value = 'Overall Attendance Rate';
        ws.getCell('C' + row).font = { bold: true };
        ws.getCell(row, presentCol).value = overallRate + '%';
        row += 2;

        ws.getCell('C' + row).value = 'Prepared by:';
        ws.getCell('C' + (row + 2)).value = 'TIFANNY MARTIN ARAGON';
        ws.getCell('C' + (row + 2)).font = { bold: true, underline: true };
        ws.getCell('C' + (row + 3)).value = 'Class Adviser';

        ws.getCell(row, presentCol - 3).value = 'Certified Correct:';
        ws.getCell(row + 2, presentCol - 3).value = 'MC RIZ TEMPLETON BUEN';
        ws.getCell(row + 2, presentCol - 3).font = { bold: true, underline: true };
        ws.getCell(row + 3, presentCol - 3).value = 'School Head';

        ws.getColumn(1).width = 5;
        ws.getColumn(3).width = 38;

        workbook.xlsx.writeBuffer().then(function(buffer) {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=SF2_' + monthNames[m] + '_' + y + '_Grade6_GreatGeniuses.xlsx');
            res.send(buffer);
        }).catch(function(err) {
            console.error('Excel write error:', err);
            res.status(500).json({ error: 'Failed to create Excel file' });
        });

    } catch (err) {
        console.error('SF2 download error:', err);
        res.status(500).json({ error: 'Failed to download SF2 report: ' + err.message });
    }
});

function getSchoolDays(year, month) {
    var days = [];
    var daysInMonth = new Date(year, month, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
        var date = new Date(year, month - 1, d);
        var dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            days.push(d);
        }
    }
    return days;
}

module.exports = router;

