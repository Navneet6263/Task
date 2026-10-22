import React, { useEffect, useRef } from 'react';

const LENGTH = 6;

// Six single-digit boxes for an emailed code. Supports typing, backspace, arrow keys and pasting the whole code.
// `value` is a 6-character string where empty boxes are spaces.
export default function OtpInput({ value, onChange, disabled = false, invalid = false, autoFocus = true }) {
  const refs = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => (/\d/.test(value[i] || '') ? value[i] : ' '));
  const focus = (i) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();
  const emit = (next) => onChange(next.join(''));

  useEffect(() => { if (autoFocus) focus(0); }, [autoFocus]);

  const fill = (start, text) => {
    const next = [...digits];
    text.replace(/\D/g, '').slice(0, LENGTH - start).split('').forEach((d, k) => { next[start + k] = d; });
    emit(next);
    focus(start + text.replace(/\D/g, '').length);
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Sign-in code">
      {digits.map((digit, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={digit.trim()} disabled={disabled}
          inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${i + 1}`} maxLength={LENGTH}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '');
            if (typed.length > 1) { fill(i, typed); return; }
            const next = [...digits]; next[i] = typed || ' '; emit(next);
            if (typed) focus(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digit.trim() && i > 0) { e.preventDefault(); const next = [...digits]; next[i - 1] = ' '; emit(next); focus(i - 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); focus(i - 1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); focus(i + 1); }
          }}
          onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData('text')); }}
          className={`h-14 w-full min-w-0 rounded-lg border bg-surface text-center font-mono text-2xl font-semibold text-ink transition focus:outline-none focus:ring-2 disabled:opacity-60
            ${invalid ? 'border-danger focus:ring-danger/20' : digit.trim() ? 'border-accent focus:ring-accent/20' : 'border-line focus:border-accent focus:ring-accent/20'}`} />
      ))}
    </div>
  );
}

export const otpComplete = (value) => /^\d{6}$/.test(String(value || ''));
