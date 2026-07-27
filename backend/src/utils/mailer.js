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
 * Sends a password-reset email with a direct clickable reset link.
 * @param {string} toEmail  - Recipient email
 * @param {string} resetUrl - Clickable password reset URL
 */
const sendResetLink = async (toEmail, resetUrl) => {
  const transporter = createTransporter('reset');
  const fromAddr = process.env.RESET_MAIL_USER || process.env.SMTP_USER;
  await transporter.sendMail({
    from: `"GreenTask Support" <${fromAddr}>`,
    to: toEmail,
    subject: 'Reset Your GreenTask Password',
    html: `
      <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:auto;padding:28px;border:1px solid #e2e8f0;border-radius:20px;background:#ffffff;box-shadow:0 10px 30px rgba(0,0,0,0.05)">
        <div style="text-align:center;margin-bottom:24px">
          <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#ffffff;font-size:20px;font-weight:900;line-height:48px;margin:auto">GT</div>
          <h2 style="color:#0f172a;margin-top:14px;font-size:22px;font-weight:800">Password Reset Request</h2>
        </div>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin-bottom:12px">
          We received a request to reset the password for your account associated with <strong>${toEmail}</strong>.
        </p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin-bottom:24px">
          Click the button below to set a new password. This link is valid for <strong>15 minutes</strong>.
        </p>
        <div style="margin:28px 0;text-align:center">
          <a href="${resetUrl}" style="background:linear-gradient(135deg, #2563eb, #4f46e5);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:bold;font-size:15px;display:inline-block;box-shadow:0 8px 20px rgba(37,99,235,0.3)">
            Reset Password
          </a>
        </div>
        <p style="color:#94a3b8;font-size:12px;line-height:1.5;word-break:break-all;margin-top:24px">
          If the button above does not work, copy and paste this link into your web browser:<br/>
          <a href="${resetUrl}" style="color:#2563eb">${resetUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0"/>
        <p style="color:#94a3b8;font-size:11px;margin:0;text-align:center">
          If you did not request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
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
    from: `"GreenTask Support" <${fromAddr}>`,
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

module.exports = { createTransporter, sendResetOtp, sendResetLink };

