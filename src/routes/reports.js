const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// FR-6: Reporting & Analytics
// Based on actual check-ins for the course's sessions — not formal
// enrollment — since a student can check in to any open session
// without a separate enrollment step in the current flow.
function getAttendanceRows(courseId) {
  return db.prepare(`
    SELECT u.id AS student_id, u.full_name, u.index_number,
           (SELECT COUNT(*) FROM sessions WHERE course_id = ?) AS total_sessions,
           SUM(CASE WHEN c.status = 'accepted' THEN 1 ELSE 0 END) AS attended,
           SUM(CASE WHEN c.status = 'flagged' THEN 1 ELSE 0 END) AS flagged
    FROM users u
    JOIN checkins c ON c.student_id = u.id
    JOIN sessions s ON s.id = c.session_id AND s.course_id = ?
    GROUP BY u.id
    ORDER BY u.full_name
  `).all(courseId, courseId);
}

router.get('/courses/:courseId/attendance', requireRole('lecturer', 'admin'), (req, res) => {
  res.json(getAttendanceRows(req.params.courseId));
});

router.get('/courses/:courseId/attendance.csv', requireRole('lecturer', 'admin'), (req, res) => {
  const rows = getAttendanceRows(req.params.courseId);
  const header = 'Full Name,Index Number,Total Sessions,Attended,Flagged\n';
  const body = rows.map(r => `${r.full_name},${r.index_number || ''},${r.total_sessions},${r.attended},${r.flagged}`).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${req.params.courseId}.csv"`);
  res.send(header + body);
});

router.get('/courses/:courseId/attendance.pdf', requireRole('lecturer', 'admin'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId);
  const rows = getAttendanceRows(req.params.courseId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${req.params.courseId}.pdf"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text('SmartAttend — Attendance Report', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#555').text(course ? `${course.code} — ${course.title}` : 'Course');
  doc.fillColor('#000').moveDown(1);

  const colX = [40, 220, 340, 420, 500];
  const headers = ['Name', 'Index No.', 'Sessions', 'Attended', 'Flagged'];
  doc.fontSize(10).font('Helvetica-Bold');
  headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: i < headers.length - 1 }));
  doc.moveDown(0.5);
  doc.font('Helvetica');

  if (rows.length === 0) {
    doc.fontSize(10).fillColor('#888').text('No check-ins recorded for this course yet.');
  }

  rows.forEach(r => {
    const y = doc.y;
    doc.text(r.full_name, colX[0], y, { width: 170 });
    doc.text(r.index_number || '—', colX[1], y, { width: 110 });
    doc.text(String(r.total_sessions), colX[2], y, { width: 70 });
    doc.text(String(r.attended), colX[3], y, { width: 70 });
    doc.text(String(r.flagged), colX[4], y, { width: 70 });
    doc.moveDown(0.6);
  });

  doc.moveDown(1);
  doc.fontSize(8).fillColor('#888').text(`Generated ${new Date().toLocaleString()}`);
  doc.end();
});

module.exports = router;
