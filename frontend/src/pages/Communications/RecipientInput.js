import React, { useState } from 'react';

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// Email addresses as chips. Enter, comma, space or leaving the field turns text into a chip.
export default function RecipientInput({ label, value, onChange, placeholder, id }) {
  const [draft, setDraft] = useState('');
  const commit = (raw = draft) => {
    const parts = raw.split(/[,;\s]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft('');
  };
  return (
    <div className="flex items-start gap-3 border-b border-line px-4 py-2 focus-within:bg-subtle/40">
      <label htmlFor={id} className="w-16 shrink-0 pt-1.5 text-xs font-medium text-muted">{label}</label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {value.map((email) => {
          const ok = EMAIL.test(email);
          return (
            <span key={email} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${ok ? 'border-line bg-subtle' : 'border-danger/40 bg-danger-soft text-danger'}`} title={ok ? email : 'This does not look like an email address'}>
              {email}
              <button type="button" aria-label={`Remove ${email}`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((v) => v !== email))}>&times;</button>
            </span>
          );
        })}
        <input id={id} value={draft} placeholder={value.length ? '' : placeholder} className="min-w-[160px] flex-1 bg-transparent py-1 text-sm text-ink outline-none placeholder:text-muted focus:!shadow-none"
          onChange={(e) => (/[,;\s]$/.test(e.target.value) ? commit(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => commit()} onPaste={(e) => { e.preventDefault(); commit(`${draft} ${e.clipboardData.getData('text')}`); }} />
      </div>
    </div>
  );
}

export const allValid = (list) => list.every((email) => EMAIL.test(email));
