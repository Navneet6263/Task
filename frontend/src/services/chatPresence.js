import { notify } from './feedback';
import { activeOrgId } from './workspaceSwitch';

// Which team chat is on screen right now, so a new-message notice is not shown for the chat you are reading.
let current = { open: false, teamId: null };
export const setChatPresence = (next) => { current = { ...current, ...next }; };
export const viewingTeam = (teamId) => current.open && !document.hidden && Number(current.teamId) === Number(teamId);

// One notice per conversation every few seconds: a burst of messages does not become a burst of notices
// (the unread count on Chat still goes up for each one).
const QUIET_MS = 10000;
const lastShown = new Map();

// The server's "chat_notify": a short notice for a new message in one of your teams or a direct chat.
export function showChatNotice(notice, now = Date.now()) {
  if (!notice || viewingTeam(notice.team_id)) return false;
  const key = `${notice.team_id}:${notice.direct ? notice.thread_id : 'team'}`;
  const last = lastShown.get(key);
  if (last !== undefined && now - last < QUIET_MS) return false;
  lastShown.set(key, now);
  const where = notice.direct
    ? `${notice.from} sent you a message`
    : `${notice.from} in ${notice.team_name || 'your team'}${notice.org_id && Number(notice.org_id) !== activeOrgId() && notice.workspace ? ` (${notice.workspace})` : ''}`;
  notify(notice.preview ? `${where}: ${notice.preview}` : where, 'info');
  return true;
}
