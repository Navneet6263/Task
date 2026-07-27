const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter.
 * @param {'reset'|'task'} type - Which mail account to use
 */
const createTransporter = (type = 'reset') => {
  const isReset = type === 'reset';
  return nodemailer.createTransport({
    host: isReset
      ? (process.env.RESET_MAIL_HOST || process.env.SMTP_HOST || 'smtp.office365.com')
      : (process.env.SMTP_HOST || 'smtp.office365.com'),
    port: Number(
      isReset
        ? (process.env.RESET_MAIL_PORT || process.env.SMTP_PORT || 587)
        : (process.env.SMTP_PORT || 587)
    ),
    secure: false, // Outlook uses STARTTLS on 587
    tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    auth: {
      user: isReset
        ? (process.env.RESET_MAIL_USER || process.env.SMTP_USER)
        : (process.env.SMTP_USER),
      pass: isReset
        ? (process.env.RESET_MAIL_PASS || process.env.SMTP_PASS)
        : (process.env.SMTP_PASS),
    },
  });
};

/**
 * Sends a password-reset OTP email.
 * @param {string} toEmail - Recipient email
 * @param {string} otp     - 6-digit OTP code
 */
const sendResetOtp = async (toEmail, otp) => {
  const transporter = createTransporter('reset');
  const fromAddr = process.env.RESET_MAIL_USER || process.env.SMTP_USER;
  await transporter.sendMail({
    from: `"NavTask Support" <${fromAddr}>`,
    to: toEmail,
    subject: 'Your Password Reset OTP',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#4f46e5">Password Reset Request</h2>
        <p>Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e293b;padding:16px 0">${otp}</div>
        <p style="color:#64748b;font-size:13px">If you did not request this, please ignore this email.</p>
      </div>
    `,
  });
};

module.exports = { createTransporter, sendResetOtp };
