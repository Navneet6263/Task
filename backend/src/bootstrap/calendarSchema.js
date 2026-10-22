const db = require('../config/database');

// Additive only. Events belong to one organization; only the organizer and invited
// attendees can see them. Times are wall-clock times in the app timezone (DB_TIMEZONE).
async function ensureCalendarSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.calendar_events', 'U') IS NULL
      CREATE TABLE dbo.calendar_events (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        title NVARCHAR(200) NOT NULL,
        description NVARCHAR(2000) NULL,
        event_type VARCHAR(20) NOT NULL DEFAULT 'EVENT',
        start_at DATETIME2 NOT NULL,
        end_at DATETIME2 NOT NULL,
        all_day BIT NOT NULL DEFAULT 0,
        location NVARCHAR(500) NULL,
        reminder_minutes INT NULL,
        reminder_sent_at DATETIME2 NULL,
        created_by INT NOT NULL REFERENCES dbo.users(id),
        version INT NOT NULL DEFAULT 1,
        is_deleted BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_calendar_event_type CHECK (event_type IN ('EVENT','MEETING','REMINDER')),
        CONSTRAINT ck_calendar_event_range CHECK (end_at >= start_at),
        CONSTRAINT ck_calendar_reminder CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 10080));
    IF OBJECT_ID('dbo.calendar_event_attendees', 'U') IS NULL
      CREATE TABLE dbo.calendar_event_attendees (
        event_id INT NOT NULL REFERENCES dbo.calendar_events(id),
        user_id INT NOT NULL REFERENCES dbo.users(id),
        response VARCHAR(12) NOT NULL DEFAULT 'PENDING',
        responded_at DATETIME2 NULL,
        CONSTRAINT pk_calendar_event_attendees PRIMARY KEY (event_id, user_id),
        CONSTRAINT ck_calendar_attendee_response CHECK (response IN ('PENDING','ACCEPTED','DECLINED')));
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_calendar_events_org_range' AND object_id = OBJECT_ID('dbo.calendar_events'))
      CREATE INDEX idx_calendar_events_org_range ON dbo.calendar_events(org_id, start_at, end_at) INCLUDE (created_by) WHERE is_deleted = 0;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_calendar_events_reminder_due' AND object_id = OBJECT_ID('dbo.calendar_events'))
      CREATE INDEX idx_calendar_events_reminder_due ON dbo.calendar_events(start_at) INCLUDE (reminder_minutes)
        WHERE is_deleted = 0 AND reminder_minutes IS NOT NULL AND reminder_sent_at IS NULL;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_calendar_attendees_user' AND object_id = OBJECT_ID('dbo.calendar_event_attendees'))
      CREATE INDEX idx_calendar_attendees_user ON dbo.calendar_event_attendees(user_id, event_id);
  `);
}

module.exports = { ensureCalendarSchema };
