module.exports = [
  {
    key: 'history-3c08ae2', releasedAt: '2026-08-20T04:03:25', title: 'English task messages and confirmations',
    summary: 'Remaining Hindi interface messages were translated to English, including task-related feedback.',
    why_text: 'Keep shared workplace instructions and confirmation messages consistent for employees.',
    how_text: 'Use task actions normally and read their confirmation or error text in English. If a message is unclear or still untranslated, report it from this guide with the exact screen and action.\n\nChange recorded in commit 3c08ae2 on 20 Aug 2026.', performance_text: '',
  },
  {
    key: 'history-58b85ae', releasedAt: '2026-08-10T05:49:21', title: 'Task timestamp handling for India timezone',
    summary: 'Task timestamp handling was corrected to match the application\'s India-local database date/time convention.',
    why_text: 'Avoid interpreting stored task timestamps as a different timezone and displaying an unexpected time shift.',
    how_text: 'Open a task and check its created/updated timestamp against the action time. Created-date filters refer to creation dates, not deadlines. If a timestamp still looks wrong, report the screen, displayed time and your browser timezone.\n\nChange recorded in commit 58b85ae on 10 Aug 2026. Product update timestamps are stored separately in UTC and shown in the viewer\'s local timezone.', performance_text: '',
  },
  {
    key: 'history-df25442', releasedAt: '2026-08-10T05:36:59', title: 'Created-date filters and dashboard task controls',
    summary: 'Created from and Created to controls help narrow tasks by when they were added.',
    why_text: 'Review work created during a particular day or period without confusing it with due-date filtering.',
    how_text: 'Open Dashboard → Filters. Select Created from and Created to, then press Show results in the current UI. Clear either date to remove that boundary. The end date must not be earlier than the start date.\n\nChange recorded in commit df25442 on 10 Aug 2026. Current filter layout may differ from that original release.', performance_text: '',
  },
];
