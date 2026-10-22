import React from 'react';
import { Input, Select, Textarea } from '../../ui';
const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const STATUS_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };

const statusProgress = (s) => s === 'DONE' ? 100 : s === 'IN_PROGRESS' ? 62 : s === 'PENDING' ? 30 : 14;
const dateLabel = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const dateTimeLabel = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }); };
const toInputDate = (v) => v ? String(v).split('T')[0] : '';
const val = (v) => v || '—';

/* ── Small reusable atoms ───────────────────────────────────── */
const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
    <span className="shrink-0 text-sm text-muted">{label}</span>
    <span className="text-right text-sm font-semibold">{children}</span>
  </div>
);

const Sec = ({ title, children }) => (
  <div className="rounded-lg border border-line bg-surface px-4 py-3">
    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h4>
    {children}
  </div>
);

const Label = ({ text }) => <span className="text-xs font-medium text-muted">{text}</span>;
const Sel = ({ label, value, onChange, children }) => (
  <label className="flex flex-col gap-1"><Label text={label} />
    <Select value={value} onChange={onChange}>{children}</Select>
  </label>
);
const Inp = ({ label, ...p }) => (
  <label className="flex flex-col gap-1"><Label text={label} />
    <Input {...p} />
  </label>
);
const Txt = ({ label, ...p }) => (
  <label className="flex flex-col gap-1"><Label text={label} />
    <Textarea {...p} />
  </label>
);
const LongText = ({ title, children }) => (
  <div className="mt-2"><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p><p className="whitespace-pre-wrap text-sm">{children}</p></div>
);

/* ── Issue-specific detail sections ────────────────────────── */
const BugDetailSec = ({ t }) => (
  <Sec title="Bug Details">
    <Row label="Severity">{val(t.severity)}</Row>
    <Row label="Bug Type">{val(t.bug_type)}</Row>
    <Row label="Environment">{val(t.environment)}</Row>
    <Row label="Affected Module">{val(t.affected_module)}</Row>
    {t.steps_to_reproduce && <LongText title="Steps to Reproduce">{t.steps_to_reproduce}</LongText>}
  </Sec>
);

const FeatureDetailSec = ({ t }) => (
  <Sec title="Feature Details">
    <Row label="Feature Area">{val(t.feature_area)}</Row>
    <Row label="Story Points">{val(t.story_points)}</Row>
    <Row label="MoSCoW Priority">{val(t.feature_priority)}</Row>
    {t.acceptance_criteria && <LongText title="Acceptance Criteria">{t.acceptance_criteria}</LongText>}
  </Sec>
);

const EnhDetailSec = ({ t }) => (
  <Sec title="Enhancement Details">
    <Row label="Enhancement Type">{val(t.enhancement_type)}</Row>
    <Row label="Impact Level">{val(t.impact_level)}</Row>
    <Row label="Effort Estimate">{val(t.effort_estimate)}</Row>
    {t.improvement_detail && <LongText title="What to Improve">{t.improvement_detail}</LongText>}
  </Sec>
);

const StoryDetailSec = ({ t }) => (
  <Sec title="Story Details">
    <Row label="Story Role">{val(t.story_role)}</Row>
    <Row label="Story Points">{val(t.story_points)}</Row>
    <Row label="Epic / Theme">{val(t.epic)}</Row>
    <Row label="User Persona">{val(t.persona)}</Row>
    {t.story_notes && <LongText title="Notes">{t.story_notes}</LongText>}
  </Sec>
);

const TaskClassSec = ({ t }) => (
  <Sec title="Classification">
    <Row label="Task Type">{val(t.task_type)}</Row>
    <Row label="Product">{val(t.product)}</Row>
    <Row label="Category">{val(t.category)}</Row>
  </Sec>
);

/* ── Issue-specific edit panels ────────────────────────────── */
const BugEditFields = ({ t, up }) => (
  <>
    <Sel label="Severity" value={t.severity || ''} onChange={e => up('severity', e.target.value)}>
      {['CRITICAL','HIGH','MEDIUM','LOW'].map(v => <option key={v} value={v}>{v}</option>)}
    </Sel>
    <Sel label="Bug Type" value={t.bug_type || ''} onChange={e => up('bug_type', e.target.value)}>
      <option value="">Select type</option>
      {[['UI','UI Issue'],['FUNCTIONAL','Functional'],['PERFORMANCE','Performance'],['SECURITY','Security'],['DATA','Data Issue']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <Sel label="Environment" value={t.environment || ''} onChange={e => up('environment', e.target.value)}>
      <option value="">Select env</option>
      {[['PRODUCTION','Production'],['STAGING','Staging'],['DEV','Development'],['QA','QA']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <div className="col-span-3"><Inp label="Affected Module" value={t.affected_module || ''} onChange={e => up('affected_module', e.target.value)} placeholder="e.g. Login, Dashboard" /></div>
    <div className="col-span-3"><Txt label="Steps to Reproduce" value={t.steps_to_reproduce || ''} onChange={e => up('steps_to_reproduce', e.target.value)} placeholder={"1. Go to...\n2. Click...\n\nExpected: ...\nActual: ..."} /></div>
  </>
);

const FeatureEditFields = ({ t, up }) => (
  <>
    <Sel label="Feature Area" value={t.feature_area || ''} onChange={e => up('feature_area', e.target.value)}>
      <option value="">Select area</option>
      {[['AUTH','Authentication'],['DASHBOARD','Dashboard'],['REPORTS','Reports'],['PAYMENTS','Payments'],['API','API'],['UI_UX','UI/UX'],['OTHER','Other']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <Sel label="Story Points" value={t.story_points || ''} onChange={e => up('story_points', e.target.value)}>
      <option value="">Estimate</option>
      {['1','2','3','5','8','13'].map(v => <option key={v} value={v}>{v} pts</option>)}
    </Sel>
    <Sel label="MoSCoW Priority" value={t.feature_priority || ''} onChange={e => up('feature_priority', e.target.value)}>
      <option value="">Select</option>
      {[['MUST_HAVE','Must Have'],['SHOULD_HAVE','Should Have'],['NICE_TO_HAVE','Nice to Have']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <div className="col-span-3"><Txt label="Acceptance Criteria" value={t.acceptance_criteria || ''} onChange={e => up('acceptance_criteria', e.target.value)} placeholder={"• User can...\n• System should..."} /></div>
  </>
);

const EnhEditFields = ({ t, up }) => (
  <>
    <Sel label="Enhancement Type" value={t.enhancement_type || ''} onChange={e => up('enhancement_type', e.target.value)}>
      <option value="">Select type</option>
      {[['PERFORMANCE','Performance'],['UX','UX Improvement'],['ACCESSIBILITY','Accessibility'],['REFACTOR','Refactor'],['SECURITY','Security']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <Sel label="Impact Level" value={t.impact_level || ''} onChange={e => up('impact_level', e.target.value)}>
      <option value="">Select</option>
      {[['HIGH','High'],['MEDIUM','Medium'],['LOW','Low']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <Sel label="Effort Estimate" value={t.effort_estimate || ''} onChange={e => up('effort_estimate', e.target.value)}>
      <option value="">Select</option>
      {[['XS','XS – <2hrs'],['S','S – Half day'],['M','M – 1-2 days'],['L','L – 3-5 days'],['XL','XL – 1+ week']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <div className="col-span-3"><Txt label="What to Improve" value={t.improvement_detail || ''} onChange={e => up('improvement_detail', e.target.value)} placeholder="Describe current vs improved state..." /></div>
  </>
);

const StoryEditFields = ({ t, up }) => (
  <>
    <Sel label="Story Role" value={t.story_role || ''} onChange={e => up('story_role', e.target.value)}>
      <option value="">Select role</option>
      {[['CONTENT_WRITER','Content Writer'],['SEO','SEO Specialist'],['DEVELOPER','Developer'],['DESIGNER','Designer'],['MARKETING','Marketing'],['QA','QA Tester']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </Sel>
    <Sel label="Story Points" value={t.story_points || ''} onChange={e => up('story_points', e.target.value)}>
      <option value="">Estimate</option>
      {['1','2','3','5','8'].map(v => <option key={v} value={v}>{v} pts</option>)}
    </Sel>
    <Inp label="Epic / Theme" value={t.epic || ''} onChange={e => up('epic', e.target.value)} placeholder="e.g. SEO Q3 Sprint" />
    <div className="col-span-3"><Inp label="User Persona" value={t.persona || ''} onChange={e => up('persona', e.target.value)} placeholder="e.g. First-time visitor" /></div>
    <div className="col-span-3"><Txt label="Notes" value={t.story_notes || ''} onChange={e => up('story_notes', e.target.value)} placeholder="Story details, content guidelines..." /></div>
  </>
);

const TaskEditFields = ({ t, up, opts, cats }) => (
  <>
    <Sel label="Task Type" value={t.task_type || ''} onChange={e => up('task_type', e.target.value)}>
      <option value="">Select type</option>
      {opts.task_types.map(o => <option key={o.id || o.label} value={o.label}>{o.label}</option>)}
    </Sel>
    <Sel label="Product / Module" value={t.product || ''} onChange={e => up('product', e.target.value)}>
      <option value="">Select product</option>
      {opts.products.map(o => <option key={o.id || o.label} value={o.label}>{o.label}</option>)}
    </Sel>
    <Sel label="Category" value={t.category || ''} onChange={e => up('category', e.target.value)}>
      <option value="">Select category</option>
      {cats.map(o => <option key={o.id || `${o.label}-${o.parent_value || ''}`} value={o.label}>{o.label}</option>)}
    </Sel>
  </>
);


export { STATUS_OPTIONS, STATUS_LABEL, statusProgress, dateLabel, dateTimeLabel, toInputDate, val, Row, Sec, Sel, Inp, Txt, BugDetailSec, FeatureDetailSec, EnhDetailSec, StoryDetailSec, TaskClassSec, BugEditFields, FeatureEditFields, EnhEditFields, StoryEditFields, TaskEditFields };
