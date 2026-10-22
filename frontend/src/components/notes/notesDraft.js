import { preferenceKey } from '../../services/preferences';

// Unsaved note text is kept in this browser (per user and organization) until the server
// confirms the save, so nothing is lost if the network drops or the tab closes.
const PREFIX = 'note-draft:';
const keyOf = (id) => preferenceKey(`${PREFIX}${id || 'new'}`);

export function readDraft(id) {
  try { return JSON.parse(localStorage.getItem(keyOf(id)) || 'null'); } catch { return null; }
}
export function writeDraft(id, draft) {
  try { localStorage.setItem(keyOf(id), JSON.stringify({ ...draft, savedAt: new Date().toISOString() })); return true; } catch { return false; }
}
export function clearDraft(id) {
  try { localStorage.removeItem(keyOf(id)); } catch { /* storage unavailable */ }
}
// Ids (or 'new') of every note that has an unsaved draft in this browser.
export function draftIds() {
  const prefix = preferenceKey(PREFIX);
  const ids = [];
  try { for (let i = 0; i < localStorage.length; i += 1) { const key = localStorage.key(i); if (key?.startsWith(prefix)) ids.push(key.slice(prefix.length)); } } catch { /* ignore */ }
  return ids;
}
export const isEmpty = (draft) => !draft || (!String(draft.title || '').trim() && !String(draft.body || '').trim());
