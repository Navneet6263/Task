import React from 'react';
import { Button, Chip } from '../../../ui';
import { TYPE_META } from './designerUtils';

const ACCENTS = { standard: 'from-sky-500/15', client_job: 'from-emerald-500/20', project: 'from-violet-500/15' };

// A miniature of the form so people can see the shape before choosing.
function MiniForm({ layout }) {
  const visible = layout.fields.filter((f) => !f.hidden);
  return (
    <div className="rounded-lg border border-line bg-surface p-3 shadow-sm">
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">
        {visible.slice(0, 8).map((f) => (
          <div key={f.key} className={f.width === 'full' || ['long_text', 'image', 'type_details', 'issue_type'].includes(f.type) ? 'col-span-2' : ''}>
            <p className="truncate text-[10px] font-medium text-muted">{f.label}{f.required && <span className="text-danger">*</span>}</p>
            <div className={`mt-0.5 flex items-center justify-end rounded border border-line bg-canvas px-1.5 ${f.type === 'long_text' ? 'h-7' : 'h-4'}`}>
              {['dropdown', 'priority', 'person', 'task_option'].includes(f.type) && <span className="text-[8px] text-muted">▾</span>}
            </div>
          </div>
        ))}
      </div>
      {visible.length > 8 && <p className="mt-2 text-center text-[10px] text-muted">+{visible.length - 8} more fields</p>}
    </div>
  );
}

// Pick a starting template. "In use" marks the one the live form was built from.
export default function TemplateGallery({ templates, liveTemplate, onUse, onPreview, disabled }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {templates.map((t, i) => {
        const fields = t.layout.fields.filter((f) => !f.hidden);
        return (
          <article key={t.key} style={{ animationDelay: `${i * 60}ms` }}
            className={`group flex flex-col overflow-hidden rounded-xl border bg-gradient-to-b ${ACCENTS[t.key] || 'from-subtle'} to-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-safe:animate-fade-up ${liveTemplate === t.key ? 'border-accent ring-1 ring-accent/30' : 'border-line'}`}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-semibold">{t.name}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.description}</p>
              </div>
              {liveTemplate === t.key && <Chip tone="ok">In use</Chip>}
            </div>
            <MiniForm layout={t.layout} />
            <p className="mt-3 flex flex-wrap gap-1 text-[11px] text-muted">
              <span className="font-semibold text-ink">{fields.length} fields</span>
              {t.layout.settings.time_tracking && <span>· hours per person</span>}
              {t.layout.settings.edit_window_days && <span>· locks after {t.layout.settings.edit_window_days} days</span>}
              {fields.some((f) => f.kind === 'custom') && <span>· {fields.filter((f) => f.kind === 'custom').length} custom ({[...new Set(fields.filter((f) => f.kind === 'custom').map((f) => TYPE_META[f.type][0]))].slice(0, 3).join(', ')})</span>}
            </p>
            <div className="mt-auto flex gap-2 pt-3">
              <Button size="sm" onClick={() => onPreview(t.layout)}>Preview</Button>
              <Button size="sm" variant="primary" className="flex-1" disabled={disabled} onClick={() => onUse(t)}>Use this template</Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
