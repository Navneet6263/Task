import React, { useRef, useState } from 'react';
import { notify } from '../../services/feedback';
import { Button, Modal } from '../../ui';

// A task's picture (tasks.reference_image, saved as a data URL). The same rules when creating and editing:
// a real picture (PNG, JPG, WEBP or GIF) of at most 450 KB. The server checks again.
export const MAX_PICTURE_BYTES = 450 * 1024;
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// Reads a chosen file; calls done(dataUrl), or shows why it cannot be used.
export function readPicture(file, done) {
  if (!file) return;
  if (!PICTURE_TYPES.includes(file.type)) { notify('Pick a PNG, JPG, WEBP or GIF picture.'); return; }
  if (file.size > MAX_PICTURE_BYTES) { notify('This picture is over 450 KB. Please pick a smaller one or compress it first.'); return; }
  const reader = new FileReader();
  reader.onload = () => done(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => notify('Could not read the picture. Try again.');
  reader.readAsDataURL(file);
}

// Task window: shows the picture (click for full size) with Replace and Remove, or "Add picture".
// onChange(dataUrl | '') saves at once, like the other quick fields.
export default function TaskPicture({ value, onChange, disabled = false, onOpenChange }) {
  const input = useRef(null);
  const [big, setBigState] = useState(false);
  // Tells the task window a window is on top, so Escape closes only the picture.
  const setBig = (open) => { setBigState(open); onOpenChange?.(open); };
  const [confirming, setConfirming] = useState(false);
  const pick = () => input.current?.click();
  const chosen = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    readPicture(file, (dataUrl) => onChange(dataUrl));
  };
  const fileInput = <input ref={input} type="file" accept={PICTURE_TYPES.join(',')} className="hidden" aria-label="Choose a picture" onChange={chosen} />;

  if (!value) {
    return (
      <div>
        {fileInput}
        <button type="button" disabled={disabled} onClick={pick}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-line px-3 py-2 text-sm text-muted hover:border-accent/60 hover:text-accent disabled:opacity-60">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
          </svg>
          Add picture <span className="text-xs">(PNG, JPG, WEBP or GIF, up to 450 KB)</span>
        </button>
      </div>
    );
  }
  return (
    <figure className="overflow-hidden rounded-md border border-line">
      {fileInput}
      <figcaption className="flex flex-wrap items-center gap-2 px-3 pb-1 pt-2">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Picture</span>
        {confirming ? <>
          <span className="text-xs">Remove the picture?</span>
          <Button size="sm" variant="danger" disabled={disabled} onClick={() => { setConfirming(false); onChange(''); }}>Remove</Button>
          <Button size="sm" onClick={() => setConfirming(false)}>Keep</Button>
        </> : <>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={pick}>Replace</Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setConfirming(true)}>Remove</Button>
        </>}
      </figcaption>
      <button type="button" onClick={() => setBig(true)} title="See it full size" className="block w-full">
        <img src={value} alt="Task" className="block max-h-[260px] w-full object-contain" />
      </button>
      {big && (
        <Modal title="Picture" onClose={() => setBig(false)} size="lg">
          <img src={value} alt="Task, full size" className="mx-auto block max-h-[75vh] w-auto max-w-full" />
        </Modal>
      )}
    </figure>
  );
}
