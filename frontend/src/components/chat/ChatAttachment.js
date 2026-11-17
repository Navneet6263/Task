import React, { useState } from 'react';
import { chat } from '../../services/api';
import { notify } from '../../services/feedback';

// Supporting documents in chat: what can be sent, the 1 MB limit, and how a file shows in a message.
export const MAX_BYTES = 1024 * 1024;
export const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp';
const ALLOWED = ACCEPT.split(',').map((e) => e.slice(1));
export const TOO_BIG = 'This file is over 1 MB. Please compress it first, then attach it again.';

// Why a chosen file cannot be sent, or '' when it can.
export function fileProblem(file) {
  if (!file) return '';
  const ext = (String(file.name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (!ALLOWED.includes(ext)) return 'This kind of file cannot be sent. Use PDF, Word, Excel, PowerPoint, CSV, text or a picture.';
  if (!file.size) return 'The file is empty.';
  if (file.size > MAX_BYTES) return TOO_BIG;
  return '';
}

export const sizeLabel = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const FileIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" />
  </svg>
);
export const ClipIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
  </svg>
);

// A file inside a message bubble: name, size and a download button (the download carries the sign-in).
export function AttachmentChip({ teamId, attachment, mine = false }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!attachment.id) return;
    setBusy(true);
    try {
      const { data } = await chat.downloadFile(teamId, attachment.id);
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: attachment.mime }));
      const link = document.createElement('a');
      link.href = url; link.download = attachment.file_name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) { notify('Could not download the file.'); }
    finally { setBusy(false); }
  };
  return (
    <div className={`mt-1 flex max-w-[260px] items-center gap-2 rounded-lg border px-2.5 py-2 ${mine ? 'border-accent-fg/30 bg-accent-fg/10' : 'border-line bg-surface'}`}>
      <span className={mine ? 'text-accent-fg' : 'text-accent'}><FileIcon /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.file_name}</span>
        <span className={`block text-[11px] ${mine ? 'opacity-80' : 'text-muted'}`}>{sizeLabel(attachment.size || 0)}</span>
      </span>
      {attachment.id && (
        <button type="button" onClick={download} disabled={busy} aria-label={`Download ${attachment.file_name}`}
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${mine ? 'hover:bg-accent-fg/15' : 'text-accent hover:bg-subtle'}`}>{busy ? '…' : 'Download'}</button>
      )}
    </div>
  );
}
