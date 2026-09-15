# Workspace upgrade — manual acceptance flow

No commit or push has been made. Review and test locally/staging before pushing.

Latest local verification: 16 backend tests + 12 frontend tests passed; production frontend build succeeded; `git diff --check` passed. The initial JavaScript bundle is about 78.8 KB gzip after route splitting (this is not an API latency benchmark).

## 1. Prepare a safe test environment

- Use a staging/test SQL Server database, not the live employee database. Back it up first.
- Keep the existing environment values private. No production credentials are needed in this document.
- In the backend test environment set `ENABLE_BACKGROUND_JOBS=false` and `ENABLE_TELEGRAM_BOT=false` before starting. This prevents existing email ingestion, overdue notifications and the bot from acting on real accounts while you test.
- The default startup still applies existing schema checks plus additive workspace migrations. New fields/tables cover per-user read receipts, completion timestamps, blockers, review, checklist, followers and recurrence. No existing task counts/data are intentionally reset.
- For a separate migration step, run `node scripts/migrate.js` from `backend` against the **test database**. After a successful migration, `RUN_MIGRATIONS_ON_START=false` skips repeat startup migration work. Do not skip migrations on an old schema.
- From `backend`: `npm ci`, then `npm start`.
- From `frontend`: `npm ci`, then `npm start`. Confirm the frontend API/WS environment points to the test backend.
- Prepare two employees in Team A, one employee only in Team B, and a Team A creator/admin. Use separate browser profiles for simultaneous-user checks.

## 2. Counts, filters and board

1. Open Dashboard. Compare **Total Tasks, Open Queue, Completed and Overdue** against your known Team A records. These cards are team totals, not the current page length.
2. Select **Bug + Story**, **High + Medium**, two members, a client and a created-date range in Filters. The panel must expand below the toolbar on the same page; no side drawer.
3. In DevTools Network, selections should not send task-list requests until **Show results**. One Apply should issue one list request, including when changing filters from a later page.
4. Check the result count and compact filter chips. Remove a chip; clear filters. Team-total cards must remain unchanged by these filters.
5. Set a reversed date range: browser controls should prevent it, and the API must reject invalid ranges/impossible calendar dates.
6. Try newest, oldest, due date, priority and title sorting. Paging must retain the order. Records with the same created time should not randomly swap pages.
7. Open Board with more than 12 tasks in at least two statuses. Every column shows its full filtered count and a loaded count. **Load more** must load that column, without resetting the others.
8. Drag or use a status selector. Reload and check the task's status/counts. Simulate a failed request: show an error, do not silently pretend success.
9. Hide/show insights and collapse the main sidebar. No metric cards should disappear. Test the creator/date column toggle.
10. Switch teams while loading. Team A rows must not remain labelled as Team B after a request finishes.

## 3. Saved views and personal memory

1. Save a view; choose actual Bug/Story, priority, member/client selections inside the save dialog. Review the selected values before saving.
2. Apply it, rename it, replace it using the same name (confirmation required), and set/unset the star/default.
3. Refresh, navigate away/back, then log out/in as the **same account**. Saved views, selected layout, column preference and templates should remain in this browser.
4. Log in as a different employee or switch organizations. Personal views/templates/plans must not be reused across identities.
5. Delete a saved view only after confirmation. Existing employee saved views from the old key should migrate without deleting the original key.
6. Saved views/templates/top-three are **browser-local**, not cross-device sync. Clearing browser site data removes them.

## 4. Create, draft, template and duplicate

1. Create Task must open immediately, with the dashboard visible behind it.
2. Try every issue type. Enter title, description, client, assignee and dates. Type a new client name and create the task.
3. Close with text entered: confirm the warning, reopen and check draft recovery. Refresh with an open draft and verify recovery in this browser.
4. Save/apply/replace/delete a personal template. Templates preserve reusable fields but do not copy dates or the reference image.
5. Upload an allowed image under 450 KB. Ensure the backend accepts the base64 payload. Larger/non-image files must show validation feedback.
6. Create & add another: the form stays open, useful defaults remain, the old title is cleared, and only one task is created per submit.
7. Duplicate from task details. Confirm an unassigned copy appears in the same team. It must not copy completion/review/delete state.
8. Block storage in the browser: a failed draft/view save must not be described as successfully persisted.

## 5. Reliable editing and conflicts

1. Open Edit. Type several characters in title/client/description: no PUT should happen per keystroke.
2. Click Save changes. Check one PUT with changed fields and `version`; the returned version must be used for the next save.
3. Use two browser profiles to open the same task. Save in profile A; save an older draft in profile B. B should show a conflict and retain its text, not overwrite A.
4. Reload latest only after confirming discard. Close/Escape/reload with unsaved edits must warn.
5. Simulate offline/500/timeout. Keep the draft and show a retryable error. Do not clear the last loaded list just because refresh failed.
6. Complete a task, then edit an unrelated field. Its recorded completion time should not move. Reopening clears completion time; completing again records the new completion.

## 6. Checklist, blockers, review, followers and mentions

1. Add/check/uncheck/delete checklist steps. Refresh and verify persistence.
2. Save a blocker reason and choose a teammate for help. Verify task badge and the teammate notification. Clear the blocker explicitly.
3. Request review. Creator/admin can Approve & complete or Request changes. Request changes requires a note and reopens the task.
4. A regular non-creator must not be able to approve another person's review via either UI or API.
5. Follow a task as employee B. Employee A updates it/comments; B gets a task notification. Unfollow and verify optional follower notifications stop (assignee/creator notifications still apply).
6. Mention a Team A member in a comment. A Team B-only user ID supplied manually must not receive that task's notification.
7. Read comments as A, then as B. Read state must be per-user and persist after refresh. Opening details alone should not mark comments read.
8. While Edit has an unsaved draft, workflow actions should ask you to save/discard first through the disabled workflow panel.

## 7. My Day, My Tasks and bulk actions

1. My Day includes your unfinished due/overdue work, no-due tasks and in-progress work; excludes completed/actively snoozed tasks.
2. Pin up to three personal focus tasks. Refresh and reopen them. Pins do not modify shared task priority.
3. My Tasks shows accurate full summary totals and a bounded 24-row page. Use a status filter to reach all tasks in a queue. Its column cards are explicitly page-local.
4. Open a task from My Tasks: edit choices, delete request/approval/rejection and save must be real actions, not placeholders.
5. Select tasks on a list page and bulk-change status/priority/assignee. Check results individually.
6. Cause one version conflict in a bulk update. A persistent notice must identify failures; do not report the whole batch successful.
7. Changing the list page clears selection. Destructive bulk deletion remains server-permission checked.

## 8. Search, notifications, chat and reports

1. Search by title/client/TASK-ID. Click a result or use a copied task link to open the exact task. Try Ctrl/Cmd+K and Escape.
2. Notification click opens its task; mark-one and mark-all work. The badge includes unread items beyond the most recent 30. Unread filtering should query unread items, not just filter the last mixed page locally.
3. Before Chat is opened, its heavy UI should not load. The lightweight unread listener remains active; fallback polling is once a minute and skips hidden tabs.
4. Send group/direct messages, close/open chat, reconnect and switch threads quickly. Verify current-thread history is not replaced by an old request.
5. With over 150 messages, first load shows the latest history; Load older reaches earlier messages. Test reply, failed send, live-review screen sharing/mic/ICE reconnect in two profiles.
6. Reports should issue one team-report request, not one performance request per member. Change team/period quickly; stale responses must not overwrite the selected team.
7. Compare report counts with assigned tasks created in the selected period. Unassigned tasks are intentionally not included in the member report.
8. On-time rate/evidence only uses tasks with a recorded completion timestamp and due date. Historical tasks are not backfilled with invented completion dates.
9. Export CSV and open it. Names with quotes/commas and values beginning with formula characters must remain plain text.
10. PMS Hub shows real paginated activity and a personal focus plan, not a fabricated KPI/person rating.

## 9. Recurring tasks — isolated opt-in test

- In the isolated test environment only, set `ENABLE_RECURRING_TASKS=true` and `ENABLE_BACKGROUND_JOBS=true`, then restart. Enabling background jobs also enables the existing overdue/email schedules, so keep production inbox/bot credentials disconnected.
- As creator/admin, configure Daily/Weekly/Monthly on an **open task with a due date**; then complete it.
- Within the next scheduled minute, verify exactly one successor, assigned only to a still-valid member, with a future due date. Checklist/review reset; no historical catch-up burst should be created.
- Repeated worker ticks must not duplicate that successor. A unique filtered index enforces one successor per source task.
- Verify month-end and leap-year handling. Turn recurrence off on the open successor to stop the chain. Already-created successors are not automatically deleted.
- The UI warns when the recurring worker is not configured. Validate the real worker logs; configuration is not proof that a process is healthy.

## 10. Permissions, performance and release gate

- As the Team B-only employee, try Team A detail/comments/create-comment/bug-pick/resolve/workflow/checklist/report endpoints. Expect 403 and no mutation/data response.
- Try unauthorized WebSocket joins and forged preview/signalling targets. Only authorized team/session traffic should relay. Also test removal from a team and expired tokens in staging.
- Record API p50/p95, request count, payload size and SQL plans with representative data/concurrency. `X-Request-ID`, slow API logs and hashed slow-SQL logs help correlate issues without logging tokens/bodies.
- Tune `TRUST_PROXY_HOPS` only to the actual trusted deployment proxy chain. Authenticated API limits are user-based; failed/unauthenticated requests still use IP controls.
- Run `npm test` in backend; `npm test -- --runInBand --watchAll=false` and `npm run build` in frontend. Review `git diff --check`.
- Try desktop, narrow laptop and mobile widths, keyboard-only navigation and reduced-motion settings. Automated DOM tests are not a substitute for visual/browser acceptance.
- Do not push until migrations, multi-user permissions, two-editor conflict handling and existing live-review/email workflows pass against staging.

## Verification limits and remaining deployment work

Automated checks use a mocked database; no real SQL Server migration/query execution or production latency measurement was performed by the agent. No live email, bot or recurring worker was started.

SQL execution-plan tuning, multi-instance shared WebSocket infrastructure, durable notification/email delivery and cross-device personal-view storage still need deployment-specific work. Notifications currently log delivery failures after preserving the successful task/comment write; they do not have durable retries. Recurring successors currently copy core task fields, not all issue-specific metadata or reference images. Existing large chat modules remain legacy files; new workspace modules and the split task/layout modules are below 300 lines.
