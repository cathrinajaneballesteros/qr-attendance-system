
const express = require('express');
const ExcelJS = require('exceljs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Middleware that checks token from header OR query string
function authFlexible(req, res, next) {
    let token = null;

    // Check Authorization header first
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // If no header token, check query string
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'qr-attendance-secret-key-2024');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token.' });
    }
}

function getSchoolDays(year, month) {
    const days = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            days.push(d);
        }
    }
    return days;
}

function getDayLabel(year, month, day) {
    const date = new Date(year, month - 1, day);
    const labels = ['SU', 'M', 'T', 'W', 'TH', 'F', 'SA'];
    return labels[date.getDay()];
}

// JSON report endpoint
router.get('/report/:year/:month', authenticateToken, (req, res) => {
    try {
        const { year, month } = req.params;
        const paddedMonth = month.padStart(2, '0');
        const startDate = `${year}-${paddedMonth}-01`;
        const endDate = `${year}-${paddedMonth}-31`;
        const schoolDays = getSchoolDays(parseInt(year), parseInt(month));

        const students = query("SELECT * FROM students WHERE status = 'Active' ORDER BY gender DESC, last_name ASC");

        const report = students.map(student => {
            const attendance = query('SELECT date, status FROM attendance WHERE student_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC', [student.id, startDate, endDate]);
            const totalPresent = attendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
            const totalAbsent = attendance.filter(a => a.status === 'Absent').length;
            const daily = {};
            attendance.forEach(a => {
                const day = parseInt(a.date.split('-')[2]);
                daily[day] = a.status === 'Present' ? '✓' : a.status === 'Late' ? 'L' : a.status === 'Excused' ? 'E' : '✗';
            });
            return {
                id: student.id,
                name: `${student.last_name},${student.first_name}, ${student.middle_name}`,
                lrn: student.lrn || 'N/A',
                gender: student.gender,
                daily,
                total_present: totalPresent,
                total_absent: totalAbsent,
                school_days: schoolDays.length,
                attendance_rate: schoolDays.length > 0 ? ((totalPresent / schoolDays.length) * 100).toFixed(1) : '0.0'
            };
        });

        const maleStudents = report.filter(s => s.gender === 'Male');
        const femaleStudents = report.filter(s => s.gender === 'Female');
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        res.json({
            school: 'Sta. Rosa ES', school_id: '102056', grade_level: 'Grade 6', section: 'Great Geniuses',
            school_year: `${year}-${parseInt(year) + 1}`, month: monthNames[parseInt(month) - 1],
            adviser: 'Tifanny Martin Aragon', school_head: 'MC Riz Templeton Buen',
            school_days: schoolDays,
            summary: {
                total_enrollment: students.length, male_count: maleStudents.length, female_count: femaleStudents.length,
                total_school_days: schoolDays.length,
                total_male_present: maleStudents.reduce((s, x) => s + x.total_present, 0),
                total_female_present: femaleStudents.reduce((s, x) => s + x.total_present, 0),
                total_male_absent: maleStudents.reduce((s, x) => s + x.total_absent, 0),
                total_female_absent: femaleStudents.reduce((s, x) => s + x.total_absent, 0),
                overall_present: report.reduce((s, x) => s + x.total_present, 0),
                overall_absent: report.reduce((s, x) => s + x.total_absent, 0)
            },
            male_students: maleStudents, female_students: femaleStudents
        });
    } catch (err) {
        console.error('SF2 Report error:', err);
        res.status(500).json({ error: 'Failed to generate report: ' + err.message });
    }
});

// EXCEL DOWNLOAD - Uses flexible auth (header OR query string)
router.get('/download/:year/:month', authFlexible, async (req, res) => {
    try {
        const { year, month } = req.params;
        const paddedMonth = month.padStart(2, '0');
        const startDate = `${year}-${paddedMonth}-01`;
        const endDate = `${year}-${paddedMonth}-31`;
        const schoolDays = getSchoolDays(parseInt(year), parseInt(month));
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthName = monthNames[parseInt(month) - 1].toUpperCase();

        const students = query("SELECT * FROM students WHERE status = 'Active' ORDER BY gender DESC, last_name ASC");
        const maleStudents = students.filter(s => s.gender === 'Male');
        const femaleStudents = students.filter(s => s.gender === 'Female');

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet(monthNames[parseInt(month) - 1]);

        // ===== STYLES =====
        const headerFont = { name: 'Arial', size: 10, bold: true };
        const normalFont = { name: 'Arial', size: 8 };
        const smallFont = { name: 'Arial', size: 7 };
        const thinBorder = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
        };

        // ===== ROW 1: Title =====
        ws.mergeCells('A1:AR1');
        ws.getCell('A1').value = 'School Form 2 (SF2) Daily Attendance Report of Learners';
        ws.getCell('A1').font = { name: 'Arial', size: 12, bold: true };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        // ===== ROW 2: Subtitle =====
        ws.mergeCells('A2:AR2');
        ws.getCell('A2').value = '(This replaces Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)';
        ws.getCell('A2').font = { name: 'Arial', size: 9, italic: true };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        // ===== ROW 3: School Info =====
        ws.getCell('A3').value = 'School ID';
        ws.getCell('A3').font = headerFont;
        ws.getCell('F3').value = '102056';
        ws.getCell('F3').font = normalFont;
        ws.getCell('J3').value = 'School Year';
        ws.getCell('J3').font = headerFont;
        ws.getCell('M3').value = `${year} - ${parseInt(year) + 1}`;
        ws.getCell('M3').font = normalFont;
        ws.getCell('S3').value = 'Report for the Month of';
        ws.getCell('S3').font = headerFont;
        ws.getCell('AA3').value = monthName;
        ws.getCell('AA3').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0000FF' } };

        // ===== ROW 4: School Name =====
        ws.getCell('A4').value = 'Name of School';
        ws.getCell('A4').font = headerFont;
        ws.getCell('F4').value = 'Sta. Rosa ES';
        ws.getCell('F4').font = normalFont;
        ws.getCell('S4').value = 'Grade Level';
        ws.getCell('S4').font = headerFont;
        ws.getCell('AA4').value = 'Grade 6';
        ws.getCell('AA4').font = normalFont;
        ws.getCell('AH4').value = 'Section';
        ws.getCell('AH4').font = headerFont;
        ws.getCell('AL4').value = 'GREAT GENIUSES';
        ws.getCell('AL4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0000FF' } };

        // ===== ROW 5-6: Column Headers =====
        ws.getCell('A5').value = 'No.';
        ws.getCell('A5').font = headerFont;
        ws.getCell('A5').border = thinBorder;
        ws.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell('B5').value = 'NAME\n(Last Name, First Name, Middle Name)';
        ws.getCell('B5').font = headerFont;
        ws.getCell('B5').alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
        ws.getCell('B5').border = thinBorder;

        // Day number headers (Row 5) and Day label headers (Row 6)
        const dayStartCol = 3;
        schoolDays.forEach((day, i) => {
            const col = dayStartCol + i;
            // Day number
            ws.getCell(5, col).value = day;
            ws.getCell(5, col).font = smallFont;
            ws.getCell(5, col).alignment = { horizontal: 'center' };
            ws.getCell(5, col).border = thinBorder;
            // Day label
            ws.getCell(6, col).value = getDayLabel(parseInt(year), parseInt(month), day);
            ws.getCell(6, col).font = smallFont;
            ws.getCell(6, col).alignment = { horizontal: 'center' };
            ws.getCell(6, col).border = thinBorder;
        });

        // Total columns
        const absentCol = dayStartCol + schoolDays.length;
        const presentCol = absentCol + 1;
        const remarksCol = presentCol + 1;

        ws.getCell(5, absentCol).value = 'Total for the Month';
        ws.getCell(5, absentCol).font = { name: 'Arial', size: 7, bold: true };
        ws.getCell(5, absentCol).border = thinBorder;
        ws.getCell(5, absentCol).alignment = { horizontal: 'center' };

        ws.getCell(6, absentCol).value = 'ABSENT';
        ws.getCell(6, absentCol).font = { name: 'Arial', size: 7, bold: true, color: { argb: 'FFFF0000' } };
        ws.getCell(6, absentCol).border = thinBorder;
        ws.getCell(6, absentCol).alignment = { horizontal: 'center' };

        ws.getCell(6, presentCol).value = 'PRESENT';
        ws.getCell(6, presentCol).font = { name: 'Arial', size: 7, bold: true, color: { argb: 'FF008000' } };
        ws.getCell(6, presentCol).border = thinBorder;
        ws.getCell(6, presentCol).alignment = { horizontal: 'center' };

        ws.getCell(5, remarksCol).value = 'REMARKS';
        ws.getCell(5, remarksCol).font = { name: 'Arial', size: 7, bold: true };
        ws.getCell(5, remarksCol).border = thinBorder;

        // ===== MALE STUDENTS =====
        let currentRow = 7;
        let maleTotalPresent = 0;
        let maleTotalAbsent = 0;
        const maleDailyTotals = {};

        maleStudents.forEach((student, index) => {
            const attendance = query('SELECT date, status FROM attendance WHERE student_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC', [student.id, startDate, endDate]);
            const attendanceMap = {};
            attendance.forEach(a => {
                const day = parseInt(a.date.split('-')[2]);
                attendanceMap[day] = a.status;
            });

            ws.getCell(currentRow, 1).value = index + 1;
            ws.getCell(currentRow, 1).font = normalFont;
            ws.getCell(currentRow, 1).border = thinBorder;
            ws.getCell(currentRow, 1).alignment = { horizontal: 'center' };

            ws.getCell(currentRow, 2).value = `${student.last_name},${student.first_name}, ${student.middle_name}`;
            ws.getCell(currentRow, 2).font = normalFont;
            ws.getCell(currentRow, 2).border = thinBorder;

            let present = 0, absent = 0;
            schoolDays.forEach((day, i) => {
                const col = dayStartCol + i;
                const status = attendanceMap[day];
                if (status === 'Present' || status === 'Late') {
                    present++;
                    maleDailyTotals[day] = (maleDailyTotals[day] || 0) + 1;
                } else if (status === 'Absent') {
                    ws.getCell(currentRow, col).value = '✗';
                    ws.getCell(currentRow, col).font = { name: 'Arial', size: 8, color: { argb: 'FFFF0000' } };
                    absent++;
                }
                ws.getCell(currentRow, col).border = thinBorder;
                ws.getCell(currentRow, col).alignment = { horizontal: 'center' };
            });

            ws.getCell(currentRow, absentCol).value = absent;
            ws.getCell(currentRow, absentCol).font = normalFont;
            ws.getCell(currentRow, absentCol).border = thinBorder;
            ws.getCell(currentRow, absentCol).alignment = { horizontal: 'center' };

            ws.getCell(currentRow, presentCol).value = present;
            ws.getCell(currentRow, presentCol).font = normalFont;
            ws.getCell(currentRow, presentCol).border = thinBorder;
            ws.getCell(currentRow, presentCol).alignment = { horizontal: 'center' };

            maleTotalPresent += present;
            maleTotalAbsent += absent;
            currentRow++;
        });

        // MALE TOTAL ROW
        ws.getCell(currentRow, 1).value = maleStudents.length;
        ws.getCell(currentRow, 1).font = headerFont;
        ws.getCell(currentRow, 1).border = thinBorder;
        ws.getCell(currentRow, 1).alignment = { horizontal: 'center' };

        ws.getCell(currentRow, 2).value = '<=== MALE | TOTAL Per Day ===>';
        ws.getCell(currentRow, 2).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF0000FF' } };
        ws.getCell(currentRow, 2).border = thinBorder;

        schoolDays.forEach((day, i) => {
            const col = dayStartCol + i;
            ws.getCell(currentRow, col).value = maleDailyTotals[day] || 0;
            ws.getCell(currentRow, col).font = headerFont;
            ws.getCell(currentRow, col).border = thinBorder;
            ws.getCell(currentRow, col).alignment = { horizontal: 'center' };
            ws.getCell(currentRow, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        });

        ws.getCell(currentRow, absentCol).value = maleTotalAbsent;
        ws.getCell(currentRow, absentCol).font = headerFont;
        ws.getCell(currentRow, absentCol).border = thinBorder;
        ws.getCell(currentRow, absentCol).alignment = { horizontal: 'center' };

        ws.getCell(currentRow, presentCol).value = maleTotalPresent;
        ws.getCell(currentRow, presentCol).font = headerFont;
        ws.getCell(currentRow, presentCol).border = thinBorder;
        ws.getCell(currentRow, presentCol).alignment = { horizontal: 'center' };
        currentRow++;

        // ===== FEMALE STUDENTS =====
        let femaleTotalPresent = 0;
        let femaleTotalAbsent = 0;
        const femaleDailyTotals = {};

        femaleStudents.forEach((student, index) => {
            const attendance = query('SELECT date, status FROM attendance WHERE student_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC', [student.id, startDate, endDate]);
            const attendanceMap = {};
            attendance.forEach(a => {
                const day = parseInt(a.date.split('-')[2]);
                attendanceMap[day] = a.status;
            });

            ws.getCell(currentRow, 1).value = index + 1;
            ws.getCell(currentRow, 1).font = normalFont;
            ws.getCell(currentRow, 1).border = thinBorder;
            ws.getCell(currentRow, 1).alignment = { horizontal: 'center' };

            ws.getCell(currentRow, 2).value = `${student.last_name},${student.first_name}, ${student.middle_name}`;
            ws.getCell(currentRow, 2).font = normalFont;
            ws.getCell(currentRow, 2).border = thinBorder;

            let present = 0, absent = 0;
            schoolDays.forEach((day, i) => {
                const col = dayStartCol + i;
                const status = attendanceMap[day];
                if (status === 'Present' || status === 'Late') {
                    present++;
                    femaleDailyTotals[day] = (femaleDailyTotals[day] || 0) + 1;
                } else if (status === 'Absent') {
                    ws.getCell(currentRow, col).value = '✗';
                    ws.getCell(currentRow, col).font = { name: 'Arial', size: 8, color: { argb: 'FFFF0000' } };
                    absent++;
                }
                ws.getCell(currentRow, col).border = thinBorder;
                ws.getCell(currentRow, col).alignment = { horizontal: 'center' };
            });

            ws.getCell(currentRow, absentCol).value = absent;
            ws.getCell(currentRow, absentCol).font = normalFont;
            ws.getCell(currentRow, absentCol).border = thinBorder;
            ws.getCell(currentRow, absentCol).alignment = { horizontal: 'center' };

            ws.getCell(currentRow, presentCol).value = present;
            ws.getCell(currentRow, presentCol).font = normalFont;
            ws.getCell(currentRow, presentCol).border = thinBorder;
            ws.getCell(currentRow, presentCol).alignment = { horizontal: 'center' };

            femaleTotalPresent += present;
            femaleTotalAbsent += absent;
            currentRow++;
        });

        // FEMALE TOTAL ROW
        ws.getCell(currentRow, 1).value = femaleStudents.length;
        ws.getCell(currentRow, 1).font = headerFont;
        ws.getCell(currentRow, 1).border = thinBorder;
        ws.getCell(currentRow, 1).alignment = { horizontal: 'center' };

        ws.getCell(currentRow, 2).value = '<=== FEMALE | TOTAL Per Day ===>';
        ws.getCell(currentRow, 2).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FFE84393' } };
        ws.getCell(currentRow, 2).border = thinBorder;

        schoolDays.forEach((day, i) => {
            const col = dayStartCol + i;
            ws.getCell(currentRow, col).value = femaleDailyTotals[day] || 0;
            ws.getCell(currentRow, col).font = headerFont;
            ws.getCell(currentRow, col).border = thinBorder;
            ws.getCell(currentRow, col).alignment = { horizontal: 'center' };
            ws.getCell(currentRow, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
        });

        ws.getCell(currentRow, absentCol).value = femaleTotalAbsent;
        ws.getCell(currentRow, absentCol).font = headerFont;
        ws.getCell(currentRow, absentCol).border = thinBorder;
        ws.getCell(currentRow, absentCol).alignment = { horizontal: 'center' };

        ws.getCell(currentRow, presentCol).value = femaleTotalPresent;
        ws.getCell(currentRow, presentCol).font = headerFont;
        ws.getCell(currentRow, presentCol).border = thinBorder;
        ws.getCell(currentRow, presentCol).alignment = { horizontal: 'center' };
        currentRow += 2;

        // ===== COMBINED TOTAL ROW =====
        ws.getCell(currentRow, 2).value = '<=== COMBINED TOTAL ===>';
        ws.getCell(currentRow, 2).font = { name: 'Arial', size: 8, bold: true };
        ws.getCell(currentRow, 2).border = thinBorder;

        schoolDays.forEach((day, i) => {
            const col = dayStartCol + i;
            ws.getCell(currentRow, col).value = (maleDailyTotals[day] || 0) + (femaleDailyTotals[day] || 0);
            ws.getCell(currentRow, col).font = headerFont;
            ws.getCell(currentRow, col).border = thinBorder;
            ws.getCell(currentRow, col).alignment = { horizontal: 'center' };
            ws.getCell(currentRow, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        });

        ws.getCell(currentRow, absentCol).value = maleTotalAbsent + femaleTotalAbsent;
        ws.getCell(currentRow, absentCol).font = headerFont;
        ws.getCell(currentRow, absentCol).border = thinBorder;
        ws.getCell(currentRow, absentCol).alignment = { horizontal: 'center' };

        ws.getCell(currentRow, presentCol).value = maleTotalPresent + femaleTotalPresent;
        ws.getCell(currentRow, presentCol).font = headerFont;
        ws.getCell(currentRow, presentCol).border = thinBorder;
        ws.getCell(currentRow, presentCol).alignment = { horizontal: 'center' };
        currentRow += 2;

        // ===== SUMMARY SECTION =====
        ws.getCell(currentRow, 1).value = 'SUMMARY FOR THE MONTH';
        ws.getCell(currentRow, 1).font = { name: 'Arial', size: 10, bold: true };
        currentRow++;

        const totalEnrollment = maleStudents.length + femaleStudents.length;
        const summaryData = [
            ['', 'Male', 'Female', 'Total'],
            ['Enrollment', maleStudents.length, femaleStudents.length, totalEnrollment],
            ['No. of School Days', '', '', schoolDays.length],
            ['Total Present (Days)', maleTotalPresent, femaleTotalPresent, maleTotalPresent + femaleTotalPresent],
            ['Total Absent (Days)', maleTotalAbsent, femaleTotalAbsent, maleTotalAbsent + femaleTotalAbsent],
            ['Attendance Rate (%)',
                schoolDays.length > 0 ? ((maleTotalPresent / (maleStudents.length * schoolDays.length)) * 100).toFixed(1) : '0.0',
                schoolDays.length > 0 ? ((femaleTotalPresent / (femaleStudents.length * schoolDays.length)) * 100).toFixed(1) : '0.0',
                schoolDays.length > 0 ? (((maleTotalPresent + femaleTotalPresent) / (totalEnrollment * schoolDays.length)) * 100).toFixed(1) : '0.0'
            ],
            ['No. of students absent for 5 consecutive days', 0, 0, 0],
            ['Drop Out', 0, 0, 0],
            ['Transferred In', 0, 0, 0],
            ['Transferred Out', 0, 0, 0],
        ];

        summaryData.forEach(row => {
            ws.getCell(currentRow, 1).value = row[0];
            ws.getCell(currentRow, 1).font = row[0] === '' ? headerFont : normalFont;
            ws.getCell(currentRow, 1).border = thinBorder;
            ws.getCell(currentRow, 5).value = row[1];
            ws.getCell(currentRow, 5).font = normalFont;
            ws.getCell(currentRow, 5).border = thinBorder;
            ws.getCell(currentRow, 5).alignment = { horizontal: 'center' };
            ws.getCell(currentRow, 8).value = row[2];
            ws.getCell(currentRow, 8).font = normalFont;
            ws.getCell(currentRow, 8).border = thinBorder;
            ws.getCell(currentRow, 8).alignment = { horizontal: 'center' };
            ws.getCell(currentRow, 11).value = row[3];
            ws.getCell(currentRow, 11).font = normalFont;
            ws.getCell(currentRow, 11).border = thinBorder;
            ws.getCell(currentRow, 11).alignment = { horizontal: 'center' };
            currentRow++;
        });

        currentRow += 2;

        // ===== SIGNATURES =====
        ws.getCell(currentRow, 1).value = 'Prepared by:';
        ws.getCell(currentRow, 1).font = normalFont;
        ws.getCell(currentRow, 20).value = 'Certified Correct:';
        ws.getCell(currentRow, 20).font = normalFont;
        currentRow += 2;

        ws.getCell(currentRow, 1).value = 'TIFANNY MARTIN ARAGON';
        ws.getCell(currentRow, 1).font = { name: 'Arial', size: 10, bold: true, underline: true };
        ws.getCell(currentRow, 20).value = 'MC RIZ TEMPLETON BUEN';
        ws.getCell(currentRow, 20).font = { name: 'Arial', size: 10, bold: true, underline: true };
        currentRow++;

        ws.getCell(currentRow, 1).value = 'Class Adviser';
        ws.getCell(currentRow, 1).font = normalFont;
        ws.getCell(currentRow, 20).value = 'School Head';
        ws.getCell(currentRow, 20).font = normalFont;

        // ===== COLUMN WIDTHS =====
        ws.getColumn(1).width = 5;
        ws.getColumn(2).width = 35;
        for (let i = 3; i <= 45; i++) {
            ws.getColumn(i).width = 4;
        }

        // ===== SEND FILE =====
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=SF2_${year}_${monthName}_Grade6_GreatGeniuses.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
        console.log(`📊 SF2 Report downloaded: ${monthName} ${year}`);

    } catch (err) {
        console.error('SF2 Download error:', err);
        res.status(500).json({ error: 'Failed to generate Excel: ' + err.message });
    }
});

// Summary endpoint
router.get('/summary', authenticateToken, (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = today.substring(0, 7);

        const totalResult = query("SELECT COUNT(*) as count FROM students WHERE status = 'Active'");
        const totalStudents = totalResult.length > 0 ? totalResult[0].count : 0;

        const maleResult = query("SELECT COUNT(*) as count FROM students WHERE status = 'Active' AND gender = 'Male'");
        const maleCount = maleResult.length > 0 ? maleResult[0].count : 0;

        const femaleResult = query("SELECT COUNT(*) as count FROM students WHERE status = 'Active' AND gender = 'Female'");
        const femaleCount = femaleResult.length > 0 ? femaleResult[0].count : 0;

        const todayResult = query("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status IN ('Present', 'Late')", [today]);
        const todayPresent = todayResult.length > 0 ? todayResult[0].count : 0;

        const monthResult = query("SELECT COUNT(*) as count FROM attendance WHERE date LIKE ? AND status IN ('Present', 'Late')", [`${currentMonth}%`]);
        const monthPresent = monthResult.length > 0 ? monthResult[0].count : 0;

        res.json({
            total_students: totalStudents, male: maleCount, female: femaleCount,
            today_present: todayPresent, today_absent: totalStudents - todayPresent,
            month_total_present: monthPresent,
            attendance_rate: totalStudents > 0 ? ((todayPresent / totalStudents) * 100).toFixed(1) : '0.0'
        });
    } catch (err) {
        console.error('Summary error:', err);
        res.status(500).json({ error: 'Failed to get summary: ' + err.message });
    }
});

module.exports = router;

   