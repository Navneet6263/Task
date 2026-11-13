import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { users } from '../../services/api';
import { updateStoredUser } from '../../services/accountState';
import { notify } from '../../services/feedback';
import { Button, buttonClass } from '../../ui';
import UserAvatar, { AVATAR_CHANGED, photoProblem } from './UserAvatar';
import PhotoCropper from './PhotoCropper';

const LATER_DAYS = 3;
const laterKey = (id) => `photo-nudge-later:${id || 'me'}`;
const snoozed = (id) => { try { return Number(localStorage.getItem(laterKey(id)) || 0) > Date.now(); } catch { return false; } };

// Until someone adds a photo, a small strip at the top asks for one. "Add photo" uploads it right here;
// "Later" hides it for a few days. Faces on the dashboard and in teams make it easy to see who is who.
export default function PhotoNudge() {
  const { pathname } = useLocation();
  const [me, setMe] = useState(null); // null until the server says whether there is a photo
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => users.me()).then(({ data }) => { if (alive) setMe(data || {}); }).catch(() => {});
    const sync = (e) => setMe((prev) => (prev ? { ...prev, avatar: e.detail || null } : prev));
    window.addEventListener(AVATAR_CHANGED, sync);
    return () => { alive = false; window.removeEventListener(AVATAR_CHANGED, sync); };
  }, []);

  if (!me || me.avatar || hidden || snoozed(me.id) || pathname.startsWith('/settings') || pathname.startsWith('/account-setup')) return null;

  const later = () => { try { localStorage.setItem(laterKey(me.id), String(Date.now() + LATER_DAYS * 86400000)); } catch { /* ignore */ } setHidden(true); };
  const pick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) notify(problem); else setCropFile(file);
  };
  const upload = async (image) => {
    setCropFile(null);
    setBusy(true);
    try {
      const { data } = await users.uploadAvatar(image);
      updateStoredUser({ avatar: data.avatar });
      window.dispatchEvent(new CustomEvent(AVATAR_CHANGED, { detail: data.avatar }));
      notify('Photo added. Your team can see it now.', 'success');
    } catch (err) { notify(err.response?.data?.error || err.message || 'Could not add the photo.'); }
    finally { setBusy(false); }
  };

  return (
    <div role="region" aria-label="Add your photo" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
      <UserAvatar name={me.name} size="h-10 w-10 text-sm" tint="bg-surface text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Add your photo</p>
        <p className="text-sm text-muted">It shows on the dashboard and in your team, so everyone can see who is who.</p>
      </div>
      <div className="flex items-center gap-2">
        <label className={buttonClass('primary', 'sm', busy ? 'pointer-events-none opacity-60' : 'cursor-pointer')}>
          {busy ? 'Adding…' : 'Add photo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose your photo" disabled={busy} onChange={pick} />
        </label>
        <Button size="sm" variant="ghost" onClick={later}>Later</Button>
      </div>
      {cropFile && <PhotoCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={upload} />}
    </div>
  );
}
