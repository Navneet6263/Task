import React from 'react';
import { LABEL_HEX } from './taskExtrasStore';

// A coloured label. `onRemove` adds a small ×.
export default function LabelChip({ label, onRemove, small = false }) {
  const hex = LABEL_HEX[label.color] || LABEL_HEX.slate;
  return (
    <span className={`inline-flex max-w-[160px] items-center gap-1 rounded-full border font-semibold ${small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}
      style={{ color: hex, backgroundColor: `${hex}1f`, borderColor: `${hex}55` }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      <span className="truncate">{label.name}</span>
      {onRemove && <button type="button" aria-label={`Remove ${label.name}`} onClick={(e) => { e.stopPropagation(); onRemove(label); }} className="-mr-0.5 leading-none opacity-70 hover:opacity-100">×</button>}
    </span>
  );
}
