/**
 * Email delivery — sends account credentials and password-reset codes
 * by email when SMTP is configured, and fails gracefully (returns
 * sent:false) when it isn't, so the app never breaks either way.
 *
 * TO ACTUALLY SEND EMAILS: set these environment variables on Render
 * (Environment tab), then redeploy:
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      e.g. 587
 *   SMTP_USER      the sending email address
 *   SMTP_PASS      an app password (NOT your normal account password —
 *                  Gmail: Google Account -> Security -> App Passwords)
 *   SMTP_FROM      e.g. "SmartAttend <no-reply@yourdomain.com>"
 *
 * Without these set, sendEmail() simply returns { sent: false } and the
 * caller falls back to showing the credential on-screen instead —
 * this is exactly today's current behavior, so nothing regresses.
 */

let transporter = null;
let attemptedInit = false;

function getTransporter() {
  if (attemptedInit) return transporter;
  attemptedInit = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return null;
  }

  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function sendEmail({ to, subject, text }) {
  const t = getTransporter();
  if (!t) return { sent: false, reason: 'not_configured' };

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text,
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { sent: false, reason: 'send_error' };
  }
}

module.exports = { sendEmail };
