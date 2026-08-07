const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// FR-6: Reporting & Analytics
// Attendance rate per student for a course
router.get('/courses/:courseId/attendance', requireRole('lecturer', 'admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id AS student_id, u.full_name, u.index_number,
           COUNT(DISTINCT s.id) AS total_sessions,
           SUM(CASE WHEN c.status = 'accepted' THEN 1 ELSE 0 END) AS attended,
           SUM(CASE WHEN c.status = 'flagged' THEN 1 ELSE 0 END) AS flagged
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    JOIN courses co ON co.id = e.course_id
    LEFT JOIN sessions s ON s.course_id = co.id
    LEFT JOIN checkins c ON c.session_id = s.id AND c.student_id = u.id
    WHERE e.course_id = ?
    GROUP BY u.id
    ORDER BY u.full_name
  `).all(req.params.courseId);

  res.json(rows);
});

// Export as CSV
router.get('/courses/:courseId/attendance.csv', requireRole('lecturer', 'admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.full_name, u.index_number,
           COUNT(DISTINCT s.id) AS total_sessions,
           SUM(CASE WHEN c.status = 'accepted' THEN 1 ELSE 0 END) AS attended,
           SUM(CASE WHEN c.status = 'flagged' THEN 1 ELSE 0 END) AS flagged
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    JOIN courses co ON co.id = e.course_id
    LEFT JOIN sessions s ON s.course_id = co.id
    LEFT JOIN checkins c ON c.session_id = s.id AND c.student_id = u.id
    WHERE e.course_id = ?
    GROUP BY u.id
    ORDER BY u.full_name
  `).all(req.params.courseId);

  const header = 'Full Name,Index Number,Total Sessions,Attended,Flagged\n';
  const body = rows.map(r => `${r.full_name},${r.index_number || ''},${r.total_sessions},${r.attended},${r.flagged}`).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${req.params.courseId}.csv"`);
  res.send(header + body);
});

module.exports = router;
