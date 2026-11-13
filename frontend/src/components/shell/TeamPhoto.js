import React, { useState } from 'react';
import { teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { photoProblem } from '../account/UserAvatar';
import PhotoCropper from '../account/PhotoCropper';
import { SpaceAvatar } from './spaces';

// A team's photo or logo. Admins and managers click it to change it; it then shows everywhere the team does.
//   compact: only the picture (hover says "Change"); otherwise "Add photo / Change photo" and "Remove" sit below it.
export default function TeamPhoto({ team, canEdit = false, size = 'h-14 w-14 text-base', compact = false, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  if (!canEdit) return <SpaceAvatar team={team} size={size} />;

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
    try { await teams.uploadPhoto(team.id, image); notify(`Photo saved for ${team.name}.`, 'success'); onChanged?.(); }
    catch (err) { notify(err.response?.data?.error || err.message || 'Could not save the photo.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await teams.removePhoto(team.id); notify('Team photo removed.', 'success'); onChanged?.(); }
    catch (err) { notify(err.response?.data?.error || 'Could not remove the photo.'); }
    finally { setBusy(false); }
  };

  const picker = (
    <label className="group relative block shrink-0 cursor-pointer" title={team.photo ? 'Change the team photo' : 'Add a team photo'}>
      <SpaceAvatar team={team} size={size} />
      <span className={`absolute inset-0 grid place-items-center rounded-md bg-black/50 text-[11px] font-semibold text-white transition ${busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
        {busy ? '…' : 'Change'}
      </span>
      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Team photo for ${team.name}`} disabled={busy} onChange={pick} />
    </label>
  );
  const cropper = cropFile && <PhotoCropper file={cropFile} shape="square" title={`Photo for ${team.name}`} onCancel={() => setCropFile(null)} onDone={upload} />;
  if (compact) return <>{picker}{cropper}</>;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {picker}{cropper}
      {team.photo
        ? <button type="button" disabled={busy} onClick={remove} className="text-[11px] font-semibold text-muted hover:text-danger">Remove photo</button>
        : <span className="text-[11px] font-semibold text-accent">Add photo</span>}
    </div>
  );
}
