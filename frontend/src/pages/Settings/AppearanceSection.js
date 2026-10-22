import React from 'react';
import useTheme from '../../theme/useTheme';
import Section from './Section';

const OPTIONS = [
  { id: 'light', label: 'Light', help: 'Bright background, best in daylight.' },
  { id: 'dark', label: 'Dark', help: 'Easier on the eyes at night.' },
  { id: 'system', label: 'Match my device', help: 'Follows your computer or phone setting.' },
];

// Miniature of the app in each theme, drawn with that theme's own colours.
function Preview({ dark }) {
  const c = dark ? { bg: '#0e1411', panel: '#151d19', line: '#2a3832', ink: '#e2eae6', accent: '#4cbf91' } : { bg: '#f3f6f4', panel: '#ffffff', line: '#d6dfda', ink: '#16201b', accent: '#17775a' };
  return (
    <div className="flex h-24 overflow-hidden rounded-md border" style={{ background: c.bg, borderColor: c.line }} aria-hidden="true">
      <div className="w-1/4 border-r p-2" style={{ background: c.panel, borderColor: c.line }}>
        {[60, 80, 50].map((w, i) => <div key={i} className="mb-1.5 h-1.5 rounded" style={{ width: `${w}%`, background: i === 0 ? c.accent : c.line }} />)}
      </div>
      <div className="flex-1 p-2">
        <div className="mb-2 h-2 w-1/2 rounded" style={{ background: c.ink, opacity: 0.8 }} />
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-8 rounded border" style={{ background: c.panel, borderColor: c.line }} />)}
        </div>
      </div>
    </div>
  );
}

export default function AppearanceSection() {
  const { preference, choose } = useTheme();
  return (
    <Section title="Appearance" description="Choose how the app looks on this device. Your choice is saved in this browser.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((option) => {
          const active = preference === option.id;
          return (
            <button key={option.id} type="button" role="radio" aria-checked={active} onClick={() => choose(option.id)}
              className={`flex flex-col gap-3 rounded-lg border bg-surface p-3 text-left transition hover:border-muted ${active ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}>
              {option.id === 'system'
                ? <div className="grid grid-cols-2 gap-1.5"><Preview /><Preview dark /></div>
                : <Preview dark={option.id === 'dark'} />}
              <span className="flex items-start gap-2">
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-accent' : 'border-line'}`}>{active && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
                <span><span className="block text-sm font-semibold">{option.label}</span><span className="block text-xs text-muted">{option.help}</span></span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">Tip: the moon and sun button in the top bar switches between light and dark at any time.</p>
    </Section>
  );
}
