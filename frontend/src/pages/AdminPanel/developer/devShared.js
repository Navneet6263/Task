import React, { useState } from 'react';
import { API_BASE_URL } from '../../../services/runtimeConfig';

export const errorOf = (err, fallback) => err?.response?.data?.error || fallback;
// The address other software calls, e.g. https://task.greencall.online/api/v1
export const apiBase = () => {
  try { return `${new URL(API_BASE_URL, window.location.origin).toString().replace(/\/+$/, '')}/v1`; }
  catch { return `${window.location.origin}/api/v1`; }
};
export const when = (value) => {
  if (!value) return 'Never';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => window.prompt('Copy this', text));
  return <button type="button" onClick={copy} className={`rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold hover:border-accent hover:text-accent ${className}`}>{done ? 'Copied ✓' : label}</button>;
}

// A dark code panel with a copy button, readable in both themes.
export function CodeBlock({ code, title }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold text-muted">{title || 'Example'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto bg-[#0f172a] p-3 font-mono text-[12px] leading-relaxed text-[#e2e8f0]"><code>{code}</code></pre>
    </div>
  );
}

// A secret shown exactly once, with a warning.
export function SecretOnce({ label, value, children }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm"><strong>Copy it now.</strong> For your safety it will never be shown again. If you lose it, make a new one.</div>
      <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft p-3">
        <span className="shrink-0 text-xs text-muted">{label}</span>
        <code className="min-w-0 flex-1 break-all font-mono text-sm font-semibold">{value}</code>
        <CopyButton text={value} />
      </div>
      {children}
    </div>
  );
}
