const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter.
 * @param {'reset'|'task'} type - Which mail account to use
 */
const createTransporter = (type = 'reset') => {
  const isReset = type === 'reset';
  const port = Number(
    isReset
      ? (process.env.RESET_MAIL_PORT || process.env.SMTP_PORT || 587)
      : (process.env.SMTP_PORT || 587)
  );
  return nodemailer.createTransport({
    host: isReset
      ? (process.env.RESET_MAIL_HOST || process.env.SMTP_HOST || 'smtp.office365.com')
      : (process.env.SMTP_HOST || 'smtp.office365.com'),
    port,
    // Microsoft 365 (smtp.office365.com) and Gmail use STARTTLS on 587; 465 is TLS from the start.
    secure: port === 465,
    requireTLS: port !== 465,
    tls: { minVersion: 'TLSv1.2' },
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

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const consoleMail = (title, body) => `
  <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:auto;padding:28px;border:1px solid #d6dfda;border-radius:16px;background:#ffffff">
    <p style="margin:0 0 18px;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#0f1f18">Green<span style="color:#17775a">Task</span>
      <span style="font-size:11px;font-weight:700;color:#56665e;text-transform:uppercase;letter-spacing:1px;margin-left:6px">Console</span></p>
    <h2 style="margin:0 0 12px;font-size:19px;color:#0f1f18">${title}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid #eaf0ed;margin:24px 0 12px"/>
    <p style="color:#8a9891;font-size:11px;margin:0">GreenTask staff will never ask you for this code or link.</p>
  </div>`;

/** Sends the 6-digit code for platform console sign-in. */
const sendConsoleCode = async (toEmail, code) => {
  const fromAddr = process.env.RESET_MAIL_USER || process.env.SMTP_USER;
  await createTransporter('reset').sendMail({
    from: `"GreenTask Security" <${fromAddr}>`,
    to: toEmail,
    subject: `${code} is your GreenTask console code`,
    html: consoleMail('Your sign-in code', `
      <p style="color:#56665e;font-size:14px;line-height:1.6">Enter this code to finish signing in to the GreenTask platform console. It expires in <strong>10 minutes</strong> and works once.</p>
      <p style="font-family:Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#0f1f18;background:#f5f8f6;border-radius:12px;padding:16px;text-align:center;margin:20px 0">${code}</p>
      <p style="color:#56665e;font-size:13px;line-height:1.6">If you did not just sign in, someone may know your password. Change it and tell the platform owner.</p>`),
  });
};

/** Sends the one-time link a console helper uses to set their password. */
const sendConsoleInvite = async (toEmail, name, setupUrl) => {
  const fromAddr = process.env.RESET_MAIL_USER || process.env.SMTP_USER;
  await createTransporter('reset').sendMail({
    from: `"GreenTask Security" <${fromAddr}>`,
    to: toEmail,
    subject: 'Set your GreenTask console password',
    html: consoleMail(`Hi ${escapeHtml(name || 'there')}, set your password`, `
      <p style="color:#56665e;font-size:14px;line-height:1.6">You have been given access to the GreenTask platform console. Choose a password to finish setup. This link works once and expires in <strong>48 hours</strong>.</p>
      <p style="margin:24px 0;text-align:center"><a href="${escapeHtml(setupUrl)}" style="background:#17775a;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:10px;font-weight:700;font-size:15px;display:inline-block">Set my password</a></p>
      <p style="color:#56665e;font-size:13px;line-height:1.6">After that you sign in with your email, your password and a code we email you each time.</p>
      <p style="color:#8a9891;font-size:12px;word-break:break-all">Link not working? Copy this into your browser:<br/>${escapeHtml(setupUrl)}</p>`),
  });
};

/** Sends the 6-digit code that confirms a person's new sign-in email. */
const sendEmailCode = async (toEmail, name, code) => {
  const fromAddr = process.env.RESET_MAIL_USER || process.env.SMTP_USER;
  await createTransporter('reset').sendMail({
    from: `"GreenTask" <${fromAddr}>`,
    to: toEmail,
    subject: `${code} is your GreenTask email code`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:28px;border:1px solid #eaf0ed;border-radius:14px">
      <p style="margin:0 0 18px;font-size:16px;font-weight:700;color:#17775a">GreenTask</p>
      <h2 style="margin:0 0 12px;font-size:19px;color:#0f1f18">Hi ${escapeHtml(name || 'there')}, confirm your email</h2>
      <p style="color:#56665e;font-size:14px;line-height:1.6">Enter this code in GreenTask to add this email to your account. It expires in <strong>10 minutes</strong>.</p>
      <p style="font-family:Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#0f1f18;background:#f5f8f6;border-radius:12px;padding:16px;text-align:center;margin:20px 0">${code}</p>
      <p style="color:#8a9891;font-size:12px;line-height:1.6">Did not ask for this? You can ignore this email.</p>
    </div>`,
  });
};

module.exports = { createTransporter, sendResetOtp, sendResetLink, sendConsoleCode, sendConsoleInvite, sendEmailCode };

