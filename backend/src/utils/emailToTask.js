const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const db = require('../config/database');

/**
 * Strips the part after @ from an email address to derive a client/reporter name.
 * e.g. "navneet@gmail.com" → "navneet"
 */
const extractClientName = (fromAddr = '') => {
  const match = fromAddr.match(/([^<@\s]+)(?=@)/);
  return match ? match[1] : fromAddr.trim();
};

/**
 * Strips quoted-reply content and excessive whitespace from an email body.
 */
const cleanBody = (text = '') =>
  text
    .replace(/^>.*$/gm, '')           // remove quoted lines starting with >
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 5000);

/**
 * Main function called by cron every 2 minutes.
 * Connects to the task-inbox via IMAP, reads UNSEEN emails,
 * creates a Bug task for each, then marks emails as Seen.
 */
const fetchEmailsAndCreateTasks = async () => {
  const host = process.env.TASK_INBOX_HOST;
  const user = process.env.TASK_INBOX_USER;
  const pass = process.env.TASK_INBOX_PASS;
  const defaultTeamId = Number(process.env.TASK_INBOX_DEFAULT_TEAM_ID) || null;

  if (!host || !user || !pass || !defaultTeamId) {
    // Not configured — skip silently
    return;
  }

  const config = {
    imap: {
      user,
      password: pass,
      host,
      port: Number(process.env.TASK_INBOX_PORT || 993),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 15000,
    },
  };

  let connection;
  try {
    connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // Fetch only UNSEEN messages
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER.FIELDS (FROM SUBJECT)', 'TEXT'],
      markSeen: false,  // we'll mark manually after processing
      struct: true,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    if (!messages.length) {
      connection.end();
      return;
    }

    console.log(`[EMAIL→TASK] ${messages.length} new email(s) found`);

    for (const msg of messages) {
      try {
        // Parse header + body
        const allParts = imaps.getParts(msg.attributes.struct);
        const bodyPart = msg.parts.find((p) => p.which === 'TEXT');
        const headerPart = msg.parts.find((p) => p.which === 'HEADER.FIELDS (FROM SUBJECT)');

        const rawHeader = headerPart?.body || '';
        const parsedHeader = await simpleParser(rawHeader);

        const subject = (parsedHeader.subject || 'No Subject').trim().slice(0, 255);
        const fromAddr = parsedHeader.from?.value?.[0]?.address || parsedHeader.from?.text || '';
        const clientName = extractClientName(fromAddr);

        const rawText = bodyPart?.body || '';
        const parsedBody = await simpleParser(rawText);
        const description = cleanBody(parsedBody.text || rawText || '');

        // Try to find sender in DB (for future assignee lookup)
        let createdById = null;
        if (fromAddr) {
          const [users] = await db.execute(
            'SELECT id FROM users WHERE email = ? AND is_deleted = FALSE LIMIT 1',
            [fromAddr.toLowerCase()]
          );
          if (users.length > 0) createdById = users[0].id;
        }

        const today = new Date().toISOString().slice(0, 10);

        await db.execute(
          `INSERT INTO tasks
            (team_id, title, description, priority, status, issue_type, client_name,
             assigned_date, start_date, created_by, automated_by)
           VALUES (?, ?, ?, 'MEDIUM', 'TODO', 'bug', ?, ?, ?, ?, 'email')`,
          [
            defaultTeamId,
            subject,
            description || null,
            clientName,
            today,
            today,
            createdById,
          ]
        );

        console.log(`[EMAIL→TASK] Created task: "${subject}" from ${fromAddr}`);

        // Mark this email as SEEN so it won't be re-processed
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
      } catch (msgErr) {
        console.error('[EMAIL→TASK] Error processing message:', msgErr.message);
      }
    }

    connection.end();
  } catch (err) {
    console.error('[EMAIL→TASK] IMAP error:', err.message);
    if (connection) try { connection.end(); } catch (_) {}
  }
};

module.exports = { fetchEmailsAndCreateTasks };
