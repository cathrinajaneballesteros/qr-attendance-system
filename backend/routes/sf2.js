
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../middleware/auth');

// Get SF2 summary stats
router.get('/summary', auth, (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
        const male = db.prepare("SELECT COUNT(*) as count FROM students WHERE gender = 'Male'").get().count;
        const female = db.prepare("SELECT COUNT(*) as count FROM students WHERE gender = 'Female'").get().count;
        const todayPresent = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = 'Present'").get(today)?.count || 0;
        const todayLate = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = 'Late'").get(today)?.count || 0;
        const todayAbsent = totalStudents - todayPresent - todayLate;

        const totalRecords = db.prepare('SELECT COUNT(*) as count FROM attendance').get().count;
        const totalPresent = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE status = 'Present' OR status = 'Late'").get().count;
        const rate = totalRecords > 0 ? ((totalPresent / totalRecords) * 100) : 0;

        res.json({
            total_students: totalStudents,
            male: male,
            female: female,
            today_present: todayPresent + todayLate,
            today_absent: todayAbsent < 0 ? 0 : todayAbsent,
            attendance_rate: rate.toFixed(1)
        });
    } catch (err) {
        console.error('SF2 summary error:', err);
        res.status(500).json({ error: 'Failed to get summary' });
    }
});

// Get SF2 report data for a specific month/year
router.get('/report', auth, (req, res) => {
    try {
        const { month, year } = req.query;
        const m = parseInt(month) || (new Date().getMonth() + 1);
        const y = parseInt(year) || new Date().getFullYear();

        // Get all students separated by gender
        const maleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Male' ORDER BY last_name, first_name").all();
        const femaleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Female' ORDER BY last_name, first_name").all();
        const allStudents = [...maleStudents, ...femaleStudents];

        // Get school days in the month (weekdays only, excluding holidays)
        const schoolDays = getSchoolDays(y, m);

        // Get attendance data for each student
        const reportData = allStudents.map((student, index) => {
            const dailyAttendance = {};
            let totalPresent = 0;
            let totalAbsent = 0;

            schoolDays.forEach(day => {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = db.prepare(
                    'SELECT status FROM attendance WHERE student_id = ? AND date = ?'
                ).get(student.id, dateStr);

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
            });

            return {
                no: index + 1,
                name: student.last_name + ',' + student.first_name + ', ' + (student.middle_name || ''),
                gender: student.gender,
                daily: dailyAttendance,
                total_absent: totalAbsent,
                total_present: totalPresent
            };
        });

        // Calculate totals per day
        const maleDailyTotals = {};
        const femaleDailyTotals = {};
        schoolDays.forEach(day => {
            maleDailyTotals[day] = 0;
            femaleDailyTotals[day] = 0;
        });

        reportData.forEach(r => {
            schoolDays.forEach(day => {
                if (r.daily[day] !== 'X' && r.daily[day] !== undefined) {
                    if (r.gender === 'Male') maleDailyTotals[day]++;
                    else femaleDailyTotals[day]++;
                }
            });
        });

        const maleData = reportData.filter(r => r.gender === 'Male');
        const femaleData = reportData.filter(r => r.gender === 'Female');

        const maleTotalPresent = maleData.reduce((sum, r) => sum + r.total_present, 0);
        const maleTotalAbsent = maleData.reduce((sum, r) => sum + r.total_absent, 0);
        const femaleTotalPresent = femaleData.reduce((sum, r) => sum + r.total_present, 0);
        const femaleTotalAbsent = femaleData.reduce((sum, r) => sum + r.total_absent, 0);

        const monthNames = ['', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

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
            grand_total_present: maleTotalPresent + femaleTotalPresent,
            grand_total_absent: maleTotalAbsent + femaleTotalAbsent,
            combined_percentage: allStudents.length > 0 && schoolDays.length > 0
                ? (((maleTotalPresent + femaleTotalPresent) / (allStudents.length * schoolDays.length)) * 100).toFixed(1)
                : '0.0',
            adviser: 'Tifanny Martin Aragon',
            school_head: 'MC Riz Templeton Buen'
        });
    } catch (err) {
        console.error('SF2 report error:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Download SF2 as Excel
router.get('/download', auth, async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { month, year } = req.query;
        const m = parseInt(month) || (new Date().getMonth() + 1);
        const y = parseInt(year) || new Date().getFullYear();

        const monthNames = ['', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        const dayNames = ['SUN', 'M', 'T', 'W', 'TH', 'F', 'SAT'];

        const maleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Male' ORDER BY last_name, first_name").all();
        const femaleStudents = db.prepare("SELECT * FROM students WHERE gender = 'Female' ORDER BY last_name, first_name").all();
        const schoolDays = getSchoolDays(y, m);

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet(monthNames[m]);

        // Title rows
        ws.mergeCells('A1:AT1');
        ws.getCell('A1').value = 'School Form 2 (SF2) Daily Attendance Report of Learners';
        ws.getCell('A1').font = { bold: true, size: 14 };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        ws.mergeCells('A2:AT2');
        ws.getCell('A2').value = '(This replaces Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)';
        ws.getCell('A2').alignment = { horizontal: 'center' };
        ws.getCell('A2').font = { italic: true, size: 9 };

        // School info row
        ws.getCell('A3').value = 'School ID';
        ws.getCell('F3').value = '102056';
        ws.getCell('J3').value = 'School Year';
        ws.getCell('M3').value = '2025 - 2026';
        ws.getCell('S3').value = 'Report for the Month of';
        ws.getCell('AA3').value = monthNames[m];
        ws.getCell('AA3').font = { bold: true };

        ws.getCell('A4').value = 'Name of School';
        ws.getCell('F4').value = 'Sta. Rosa ES';
        ws.getCell('S4').value = 'Grade Level';
        ws.getCell('AA4').value = 'Grade 6';
        ws.getCell('AI4').value = 'Section';
        ws.getCell('AL4').value = 'GREAT GENIUSES';
        ws.getCell('AL4').font = { bold: true };

        // Header row - No. and Name
        const headerRow = 5;
        ws.getCell('A' + headerRow).value = 'No.';
        ws.getCell('C' + headerRow).value = 'NAME\n(Last Name, First Name, Middle Name)';

        // Day number row
        const dayNumRow = 6;
        const dayNameRow = 7;
        let col = 6; // Column F onwards for days

        const dayColumns = {};
        schoolDays.forEach(day => {
            const date = new Date(y, m - 1, day);
            const dayName = dayNames[date.getDay()];
            ws.getCell(dayNumRow, col).value = day;
            ws.getCell(dayNameRow, col).value = dayName;
            ws.getCell(dayNumRow, col).alignment = { horizontal: 'center' };
            ws.getCell(dayNameRow, col).alignment = { horizontal: 'center' };
            ws.getCell(dayNumRow, col).font = { size: 8 };
            ws.getCell(dayNameRow, col).font = { size: 8 };
            dayColumns[day] = col;
            col++;
        });

        const absentCol = col;
        const presentCol = col + 2;
        ws.getCell(dayNameRow, absentCol).value = 'ABSENT';
        ws.getCell(dayNameRow, presentCol).value = 'PRESENT';
        ws.getCell(dayNameRow, absentCol).font = { bold: true, size: 8 };
        ws.getCell(dayNameRow, presentCol).font = { bold: true, size: 8 };

        // Data rows - MALE students
        let row = 8;
        maleStudents.forEach((student, i) => {
            ws.getCell('A' + row).value = i + 1;
            ws.getCell('C' + row).value = student.last_name + ',' + student.first_name + ', ' + (student.middle_name || '');

            let absent = 0;
            let present = 0;
            schoolDays.forEach(day => {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);
                const c = dayColumns[day];
                if (record) {
                    if (record.status === 'Present' || record.status === 'Late') {
                        present++;
                    } else {
                        ws.getCell(row, c).value = 'X';
                        ws.getCell(row, c).font = { color: { argb: 'FFFF0000' } };
                        absent++;
                    }
                }
                ws.getCell(row, c).alignment = { horizontal: 'center' };
            });

            ws.getCell(row, absentCol).value = absent;
            ws.getCell(row, presentCol).value = present;
            ws.getCell(row, absentCol).alignment = { horizontal: 'center' };
            ws.getCell(row, presentCol).alignment = { horizontal: 'center' };
            row++;
        });

        // Male total row
        ws.getCell('A' + row).value = maleStudents.length;
        ws.getCell('C' + row).value = '<=== MALE | TOTAL Per Day ===>';
        ws.getCell('C' + row).font = { bold: true };
        let maleTotalPresent = 0;
        let maleTotalAbsent = 0;
        schoolDays.forEach(day => {
            let dayCount = 0;
            maleStudents.forEach(student => {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);
                if (record && (record.status === 'Present' || record.status === 'Late')) dayCount++;
            });
            ws.getCell(row, dayColumns[day]).value = dayCount;
            ws.getCell(row, dayColumns[day]).alignment = { horizontal: 'center' };
        });
        maleStudents.forEach(student => {
            schoolDays.forEach(day => {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);
                if (record) {
                    if (record.status === 'Present' || record.status === 'Late') maleTotalPresent++;
                    else maleTotalAbsent++;
                }
            });
        });
        ws.getCell(row, absentCol).value = maleTotalAbsent;
        ws.getCell(row, presentCol).value = maleTotalPresent;
        row++;

        // FEMALE students
        femaleStudents.forEach((student, i) => {
            ws.getCell('A' + row).value = i + 1;
            ws.getCell('C' + row).value = student.last_name + ',' + student.first_name + ', ' + (student.middle_name || '');

            let absent = 0;
            let present = 0;
            schoolDays.forEach(day => {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);
                const c = dayColumns[day];
                if (record) {
                    if (record.status === 'Present' || record.status === 'Late') {
                        present++;
                    } else {
                        ws.getCell(row, c).value = 'X';
                        ws.getCell(row, c).font = { color: { argb: 'FFFF0000' } };
                        absent++;
                    }
                }
                ws.getCell(row, c).alignment = { horizontal: 'center' };
            });

            ws.getCell(row, absentCol).value = absent;
            ws.getCell(row, presentCol).value = present;
            ws.getCell(row, absentCol).alignment = { horizontal: 'center' };
            ws.getCell(row, presentCol).alignment = { horizontal: 'center' };
            row++;
        });

        // Female total row
        ws.getCell('A' + row).value = femaleStudents.length;
        ws.getCell('C' + row).value = '<=== FEMALE | TOTAL Per Day ===>';
        ws.getCell('C' + row).font = { bold: true };
        let femaleTotalPresent = 0;
        let femaleTotalAbsent = 0;
        schoolDays.forEach(day => {
            let dayCount = 0;
            femaleStudents.forEach(student => {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);
                if (record && (record.status === 'Present' || record.status === 'Late')) dayCount++;
            });
            ws.getCell(row, dayColumns[day]).value = dayCount;
            ws.getCell(row, dayColumns[day]).alignment = { horizontal: 'center' };
        });
        femaleStudents.forEach(student => {
            schoolDays.forEach(day => {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const record = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ?').get(student.id, dateStr);
                if (record) {
                    if (record.status === 'Present' || record.status === 'Late') femaleTotalPresent++;
                    else femaleTotalAbsent++;
                }
            });
        });
        ws.getCell(row, absentCol).value = femaleTotalAbsent;
        ws.getCell(row, presentCol).value = femaleTotalPresent;
        row += 2;

        // Combined totals
        ws.getCell('C' + row).value = 'COMBINED TOTAL (Male + Female)';
        ws.getCell('C' + row).font = { bold: true };
        ws.getCell(row, absentCol).value = maleTotalAbsent + femaleTotalAbsent;
        ws.getCell(row, presentCol).value = maleTotalPresent + femaleTotalPresent;
        row++;

        const totalPossible = (maleStudents.length + femaleStudents.length) * schoolDays.length;
        const overallRate = totalPossible > 0 ? (((maleTotalPresent + femaleTotalPresent) / totalPossible) * 100).toFixed(1) : '0.0';
        ws.getCell('C' + row).value = 'Overall Attendance Rate';
        ws.getCell('C' + row).font = { bold: true };
        ws.getCell(row, presentCol).value = overallRate + '%';
        row += 2;

        // Signatures
        ws.getCell('C' + row).value = 'Prepared by:';
        ws.getCell('C' + (row + 2)).value = 'TIFANNY MARTIN ARAGON';
        ws.getCell('C' + (row + 2)).font = { bold: true, underline: true };
        ws.getCell('C' + (row + 3)).value = 'Class Adviser';

        ws.getCell(row, presentCol - 5).value = 'Certified Correct:';
        ws.getCell(row + 2, presentCol - 5).value = 'MC RIZ TEMPLETON BUEN';
        ws.getCell(row + 2, presentCol - 5).font = { bold: true, underline: true };
        ws.getCell(row + 3, presentCol - 5).value = 'School Head';

        // Set column widths
        ws.getColumn(1).width = 5;
        ws.getColumn(3).width = 35;

        // Generate buffer and send
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=SF2_${monthNames[m]}_${y}_Grade6_GreatGeniuses.xlsx`);
        res.send(buffer);

    } catch (err) {
        console.error('SF2 download error:', err);
        res.status(500).json({ error: 'Failed to download SF2 report: ' + err.message });
    }
});

// Helper: Get school days (weekdays) for a month
function getSchoolDays(year, month) {
    const days = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sunday and Saturday
            days.push(d);
        }
    }
    return days;
}

module.exports = router;

