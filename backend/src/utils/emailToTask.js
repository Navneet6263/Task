const imaps = require('imap-simple');
const db = require('../config/database');
const { isModuleEnabled } = require('../services/orgModules');
const { open } = require('../services/secretBox');

/**
 * Strips the part after @ from an email address to derive a client/reporter name.
 * e.g. "navneet@gmail.com" → "navneet"
 */
const extractClientName = (fromAddr = '') => {
  const str = String(fromAddr || '');
  const match = str.match(/([^<@\s]+)(?=@)/);
  return match ? match[1] : str.replace(/<[^>]+>/g, '').trim();
};

const decodeQuotedPrintable = (str = '') => {
  let text = String(str || '');
  // Remove soft line breaks: = followed by newline
  text = text.replace(/=\r?\n/g, '');

  // Replace Quoted-Printable hex bytes like =C2=A0, =20, =3D, etc.
  text = text.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
    const code = parseInt(hex, 16);
    if (code === 160) return ' ';
    return String.fromCharCode(code);
  });

  try {
    text = decodeURIComponent(escape(text));
  } catch (_) {}

  return text.replace(/[\u00A0\xA0]/g, ' ');
};

const deduplicateText = (text = '') => {
  let s = text.trim();
  if (!s) return '';

  const half = Math.floor(s.length / 2);
  for (let len = half; len >= 5; len--) {
    const part1 = s.slice(0, len).trim();
    const rest = s.slice(len).trim();
    if (part1 && (rest === part1 || rest.startsWith(part1))) {
      return part1;
    }
  }

  return s;
};

/**
 * Clean and decode email body (base64, quoted-printable, or plain HTML/text)
 */
const cleanBody = (rawText = '') => {
  let text = String(rawText || '');

  // 0. Decode Quoted-Printable encoding (=C2=A0, =20, etc.)
  text = decodeQuotedPrintable(text);

  // 1. If base64 string
  const trimmed = text.trim();
  if (trimmed.length > 20 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    try {
      text = Buffer.from(trimmed, 'base64').toString('utf8');
      text = decodeQuotedPrintable(text);
    } catch (_) {}
  }

  // 2. Strip HTML tags if HTML present
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
             .replace(/<script[\s\S]*?<\/script>/gi, ' ')
             .replace(/<[^>]*>/g, ' ');

  // 3. Strip MIME boundary markers like --0000000000006e8c7c06579629ba or --boundary--
  text = text.replace(/--[a-zA-Z0-9_-]{10,}(--)?/gi, ' ');

  // 4. Strip MIME headers and parameter tokens
  text = text.replace(/Content-(Type|Transfer-Encoding|Disposition|ID):\s*[\w\/-]+/gi, ' ');
  text = text.replace(/charset=[\"']?[A-Za-z0-9-]+[\"']?/gi, ' ');

  let cleaned = text
    .replace(/^>.*$/gm, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Deduplicate overall text if repeated
  cleaned = deduplicateText(cleaned);

  // Split by line/delimiters and deduplicate repeated plain & HTML body parts
  const phrases = cleaned
    .split(/;\s*|\n+/)
    .map((l) => l.trim().replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9]+$/, '').trim())
    .filter(Boolean);

  const uniqueParts = [];
  phrases.forEach((p) => {
    const norm = p.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exists = uniqueParts.some(
      (existing) => existing.toLowerCase().replace(/[^a-z0-9]/g, '') === norm
    );
    if (p && !exists) {
      uniqueParts.push(p);
    }
  });

  return uniqueParts.join('\n\n').slice(0, 5000);
};



/**
 * Checks if an email is an automated system message, security alert,
 * marketing email, or bot notification that should NOT create a task.
 */
const isAutomatedEmail = (fromAddr = '', subject = '', inboxAccount = process.env.TASK_INBOX_USER) => {
  const from = String(fromAddr).toLowerCase();
  const subj = String(subject).toLowerCase();
  const inboxUser = String(inboxAccount || '').toLowerCase();

  // 0. Ignore emails sent by the inbox account itself
  if (inboxUser && from.includes(inboxUser)) {
    return true;
  }

  // 1. Ignore system / bot / no-reply email senders
  const ignoredSenders = [
    'no-reply',
    'noreply',
    'do-not-reply',
    'donotreply',
    'mailer-daemon',
    'postmaster',
    'bounce',
    'notifications',
    'notification',
    'security-noreply',
    'workspace-noreply',
    'accounts.google.com',
    'support@google.com',
    'google.com',
    'info@careerfixx.com',
    'alert@',
    'alerts@',
    'newsletter',
  ];
  if (ignoredSenders.some((bot) => from.includes(bot))) {
    return true;
  }

  // 2. Ignore automated / security / system subjects
  const ignoredSubjectKeywords = [
    'security alert',
    '2-step verification',
    'thank you for choosing',
    'welcome to',
    'automatic reply',
    'auto response',
    'out of office',
    'delivery status notification',
    'undeliverable',
    'password reset',
    'reset your password',
    'verification code',
    'otp',
    'set up your booking',
    'boost productivity with',
    'write better emails',
    'streamline customer management',
    'unsubscribe',
    'newsletter',
  ];
  if (ignoredSubjectKeywords.some((kw) => subj.includes(kw))) {
    return true;
  }

  return false;
};


const imapConfig = ({ host, port, user, pass }) => ({
  imap: {
    user,
    password: String(pass || '').replace(/\s+/g, ''),
    host,
    port: Number(port || 993),
    tls: true,
    tlsOptions: { servername: host },
    authTimeout: 10000,
    connTimeout: 15000,
  },
});

/** Signs in to a mailbox and opens the inbox, to check settings before saving them. */
const testInbox = async (inbox) => {
  const connection = await imaps.connect(imapConfig(inbox));
  try { await connection.openBox('INBOX'); } finally { try { connection.end(); } catch (_) {} }
};

/**
 * Reads UNSEEN emails of one inbox, creates a Bug task for each in the inbox's team,
 * then marks them Seen. Returns { created } or { created, error }.
 */
const processInbox = async ({ host, port, user, pass, teamId: defaultTeamId, orgId }) => {
  let created = 0;
  let connection;
  try {
    connection = await imaps.connect(imapConfig({ host, port, user, pass }));
    await connection.openBox('INBOX');

    // Fetch only UNSEEN messages
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER.FIELDS (FROM SUBJECT)', 'TEXT'],
      markSeen: false,
      struct: true,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    if (!messages.length) {
      connection.end();
      return { created };
    }

    console.log(`[EMAIL→TASK] ${messages.length} new unseen email(s) found`);

    for (const msg of messages) {
      try {
        const bodyPart = msg.parts.find((p) => p.which === 'TEXT');
        const headerPart = msg.parts.find((p) => p.which === 'HEADER.FIELDS (FROM SUBJECT)');

        const headerObj = headerPart?.body || {};
        const rawSubject = Array.isArray(headerObj.subject) ? headerObj.subject[0] : (headerObj.subject || 'No Subject');
        const subject = String(rawSubject).trim().slice(0, 255);

        const rawFrom = Array.isArray(headerObj.from) ? headerObj.from[0] : (headerObj.from || '');
        const fromAddr = String(rawFrom).trim();
        const clientName = extractClientName(fromAddr);

        // Smart Filter: Skip automated system emails, security alerts, and bots
        if (isAutomatedEmail(fromAddr, subject, user)) {
          console.log(`[EMAIL→TASK] Ignored automated email: "${subject}" from ${fromAddr}`);
          await connection.addFlags(msg.attributes.uid, ['\\Seen']);
          continue;
        }

        const rawText = bodyPart?.body || '';
        const description = cleanBody(rawText);

        // Try to find sender in DB (for future assignee lookup)
        let createdById = null;
        if (fromAddr) {
          const emailMatch = fromAddr.match(/[\w.-]+@[\w.-]+\.\w+/);
          const emailOnly = emailMatch ? emailMatch[0].toLowerCase() : fromAddr.toLowerCase();

          const [users] = await db.execute(
            'SELECT id FROM users WHERE email = ? AND is_deleted = FALSE LIMIT 1',
            [emailOnly]
          );
          if (users.length > 0) createdById = users[0].id;
        }

        const today = new Date().toISOString().slice(0, 10);

        const [result] = await db.execute(
          `INSERT INTO tasks
            (team_id, org_id, title, description, priority, status, issue_type, client_name,
             assigned_date, start_date, reported_by)
           VALUES (?, ?, ?, ?, 'MEDIUM', 'TODO', 'bug', ?, ?, ?, ?)`,
          [
            defaultTeamId,
            orgId,
            subject,
            description || null,
            clientName,
            today,
            today,
            createdById,
          ]
        );

        const newTaskId = result?.insertId;

        // Create an audit log entry for traceability
        try {
          await db.execute(
            `INSERT INTO audit_logs (team_id, task_id, user_id, activity, task_details, description, automated_by)
             VALUES (?, ?, ?, 'Task Created', ?, ?, 'email')`,
            [defaultTeamId, newTaskId || null, createdById || null, subject, `Created automatically from email by ${clientName}`]
          );
        } catch (_) {}

        console.log(`[EMAIL→TASK] Created task ID ${newTaskId}: "${subject}" from ${fromAddr}`);
        created += 1;

        // Mark this email as SEEN so it won't be re-processed
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
      } catch (msgErr) {
        console.error('[EMAIL→TASK] Error processing message:', msgErr.message);
      }
    }

    connection.end();
    return { created };
  } catch (err) {
    console.error('[EMAIL→TASK] IMAP error:', err.message);
    if (connection) try { connection.end(); } catch (_) {}
    return { created, error: String(err.message || 'Could not read the inbox').slice(0, 500) };
  }
};

/**
 * Called by cron every 2 minutes. Only organizations the super admin turned "Email to task" on
 * for are read: each with its own inbox (Super Admin → company → Email to task). The old single
 * inbox from .env (TASK_INBOX_*) still works, but only if its team's organization has the module on.
 */
const fetchEmailsAndCreateTasks = async () => {
  const [inboxes] = await db.execute(
    `SELECT i.org_id, i.host, i.port, i.username, i.secret, i.team_id
     FROM org_email_inboxes i
     JOIN org_modules m ON m.org_id = i.org_id AND m.module_key = 'email_to_task' AND m.is_enabled = 1
     JOIN teams t ON t.id = i.team_id AND t.org_id = i.org_id AND t.is_deleted = 0`
  );
  for (const inbox of inboxes) {
    let result;
    try {
      result = await processInbox({ host: inbox.host, port: inbox.port, user: inbox.username, pass: open(inbox.secret), teamId: inbox.team_id, orgId: inbox.org_id });
    } catch (error) {
      result = { created: 0, error: String(error.message).slice(0, 500) };
    }
    await db.execute(
      'UPDATE org_email_inboxes SET last_checked_at = SYSDATETIME(), last_error = ?, tasks_created = tasks_created + ? WHERE org_id = ?',
      [result.error || null, result.created || 0, inbox.org_id]
    );
  }

  const legacyTeamId = Number(process.env.TASK_INBOX_DEFAULT_TEAM_ID) || null;
  if (!process.env.TASK_INBOX_HOST || !process.env.TASK_INBOX_USER || !process.env.TASK_INBOX_PASS || !legacyTeamId) return;
  const [[team]] = await db.execute('SELECT org_id FROM teams WHERE id = ?', [legacyTeamId]);
  if (!team || inboxes.some((inbox) => Number(inbox.org_id) === Number(team.org_id))) return;
  if (!await isModuleEnabled(team.org_id, 'email_to_task')) return;
  await processInbox({
    host: process.env.TASK_INBOX_HOST, port: process.env.TASK_INBOX_PORT, user: process.env.TASK_INBOX_USER,
    pass: process.env.TASK_INBOX_PASS, teamId: legacyTeamId, orgId: team.org_id,
  });
};

module.exports = { fetchEmailsAndCreateTasks, processInbox, testInbox, isAutomatedEmail };
