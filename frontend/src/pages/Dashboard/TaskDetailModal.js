import React, { useEffect } from 'react';
import TaskComments from '../../components/TaskComments';
import { tasks } from '../../services/api';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const STATUS_LABEL = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };

const statusProgress = (s) => s === 'DONE' ? 100 : s === 'IN_PROGRESS' ? 62 : s === 'PENDING' ? 30 : 14;
const dateLabel = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const toInputDate = (v) => v ? String(v).split('T')[0] : '';
const val = (v) => v || '—';

/* ── Small reusable atoms ───────────────────────────────────── */
const Row = ({ label, children }) => (
  <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0 gap-3">
    <span className="text-sm text-gray-500 shrink-0">{label}</span>
    <span className="text-sm text-gray-900 font-semibold text-right">{children}</span>
  </div>
);

const Sec = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 px-4 py-4">
    <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 mb-3">{title}</h4>
    {children}
  </div>
);

const Label = ({ text }) => <span className="text-xs font-bold text-gray-600">{text}</span>;
const cls = 'h-[38px] rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5 w-full focus:border-blue-400 outline-none';
const Sel = ({ label, value, onChange, children }) => (
  <label className="flex flex-col gap-1.5"><Label text={label} />
    <select className={cls} value={value} onChange={onChange}>{children}</select>
  </label>
);
const Inp = ({ label, ...p }) => (
  <label className="flex flex-col gap-1.5"><Label text={label} />
    <input className={cls} {...p} />
  </label>
);
const Txt = ({ label, ...p }) => (
  <label className="flex flex-col gap-1.5"><Label text={label} />
    <textarea className="rounded-xl border border-gray-300 bg-white text-gray-800 text-sm px-2.5 py-2 w-full min-h-[72px] resize-y focus:border-blue-400 outline-none" {...p} />
  </label>
);

/* ── Issue-specific detail sections ────────────────────────── */
const BugDetailSec = ({ t }) => (
  <Sec title="Bug Details">
    <Row label="Severity">{val(t.severity)}</Row>
    <Row label="Bug Type">{val(t.bug_type)}</Row>
    <Row label="Environment">{val(t.environment)}</Row>
    <Row label="Affected Module">{val(t.affected_module)}</Row>
    {t.steps_to_reproduce && <div className="mt-2"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Steps to Reproduce</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{t.steps_to_reproduce}</p></div>}
  </Sec>
);

const FeatureDetailSec = ({ t }) => (
  <Sec title="Feature Details">
    <Row label="Feature Area">{val(t.feature_area)}</Row>
    <Row label="Story Points">{val(t.story_points)}</Row>
    <Row label="MoSCoW Priority">{val(t.feature_priority)}</Row>
    {t.acceptance_criteria && <div className="mt-2"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Acceptance Criteria</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{t.acceptance_criteria}</p></div>}
  </Sec>
);

const EnhDetailSec = ({ t }) => (
  <Sec title="Enhancement Details">
    <Row label="Enhancement Type">{val(t.enhancement_type)}</Row>
    <Row label="Impact Level">{val(t.impact_level)}</Row>
    <Row label="Effort Estimate">{val(t.effort_estimate)}</Row>
    {t.improvement_detail && <div className="mt-2"><p className="text-xs font-bold text-gray-400 uppercase mb-1">What to Improve</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{t.improvement_detail}</p></div>}
  </Sec>
);

const StoryDetailSec = ({ t }) => (
  <Sec title="Story Details">
    <Row label="Story Role">{val(t.story_role)}</Row>
    <Row label="Story Points">{val(t.story_points)}</Row>
    <Row label="Epic / Theme">{val(t.epic)}</Row>
    <Row label="User Persona">{val(t.persona)}</Row>
    {t.story_notes && <div className="mt-2"><p className="text-xs font-bold text-gray-400 uppercase mb-1">Notes</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{t.story_notes}</p></div>}
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

/* ── Main component ─────────────────────────────────────────── */
const TaskDetailModal = ({ selectedTask: t, sheetTab, setSheetTab, setSelectedTask, handleDelete, handleApproveDelete, handleRejectDelete, handlePanelUpdate, members, availableTaskOptions, selectedTaskCategories }) => {
  const type = t.issue_type || 'task';
  const up = (field, value) => handlePanelUpdate(field, value);
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isCreator = t.assigned_by === user.id;

  useEffect(() => {
    if (t && Number(t.assigned_to) === Number(user.id)) {
      tasks.markTaskViewed(t.id).catch(() => {});
      t.unread_comments = 0;
    }
  }, [t, user.id]);

  return (
    <div className="fixed inset-0 bg-[rgba(15,23,42,0.45)] grid place-items-center z-[90] p-4" onClick={() => setSelectedTask(null)}>
      <aside className="grid grid-cols-[360px_1fr] w-[min(1080px,98vw)] h-[min(88vh,780px)] rounded-3xl bg-white shadow-[0_32px_80px_rgba(15,23,42,0.32)] overflow-hidden animate-[dsv2Slide_0.22s_cubic-bezier(.22,.68,0,1.2)]" onClick={e => e.stopPropagation()}>

        {/* LEFT */}
        <div className="bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#1d4ed8] px-6 py-7 flex flex-col gap-4 overflow-y-auto text-white">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-extrabold tracking-wider text-[#93c5fd] bg-white/[0.08] border border-white/[0.12] rounded-full px-3 py-1">TASK-{t.id}</div>
            <button className="bg-white/10 border border-white/[0.18] text-white w-8 h-8 rounded-full text-[15px] cursor-pointer flex items-center justify-center hover:bg-white/[0.22]" type="button" onClick={() => setSelectedTask(null)}>✕</button>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <span className={`text-[10px] font-extrabold rounded-full px-2 py-0.5 ${type === 'bug' ? 'bg-red-100 text-red-700' : type === 'story' ? 'bg-purple-100 text-purple-700' : type === 'feature' ? 'bg-emerald-100 text-emerald-700' : type === 'enhancement' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>{type.toUpperCase()}</span>
            {t.manager_assigned && <span className="text-[10px] font-extrabold rounded-full px-2 py-0.5 bg-amber-100 text-amber-800">MGR</span>}
            <span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${t.priority === 'HIGH' ? 'bg-red-100/15 text-[#fca5a5]' : t.priority === 'LOW' ? 'bg-green-100/15 text-[#6ee7b7]' : 'bg-amber-100/15 text-[#fde68a]'}`}>{t.priority || 'MEDIUM'}</span>
          </div>

          <h2 className="font-display text-[22px] font-extrabold text-white leading-tight m-0">{t.title}</h2>
          <p className="text-sm text-[#94a3b8] leading-relaxed">{t.description || 'No description provided.'}</p>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[11px] text-[#94a3b8] font-semibold"><span>Progress</span><span>{statusProgress(t.status)}%</span></div>
            <div className="h-2 rounded-full bg-white/[0.12] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#60a5fa] to-[#34d399] transition-all duration-400" style={{ width: `${statusProgress(t.status)}%` }} /></div>
            <span className={`inline-flex text-[11px] font-extrabold rounded-full px-2.5 py-1 w-fit ${t.status === 'DONE' ? 'bg-green-100/15 text-[#6ee7b7]' : t.status === 'IN_PROGRESS' ? 'bg-sky-100/15 text-[#7dd3fc]' : t.status === 'PENDING' ? 'bg-amber-100/15 text-[#fde68a]' : 'bg-blue-100/15 text-[#93c5fd]'}`}>{STATUS_LABEL[t.status] || t.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[{ label: 'Assignee', value: t.assigned_to_name || 'Unassigned' }, { label: 'Due Date', value: dateLabel(t.due_date) }, { label: 'Start Date', value: dateLabel(t.start_date) }, { label: 'Client', value: val(t.client_name) }].map((item, i) => (
              <div key={i} className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-2.5 flex flex-col gap-1">
                <span className="text-[10px] text-[#94a3b8] font-semibold uppercase tracking-wider">{item.label}</span>
                <strong className="text-sm text-white font-bold overflow-hidden text-ellipsis whitespace-nowrap">{item.value}</strong>
              </div>
            ))}
          </div>

          {t.reference_image && (
            <div className="rounded-2xl overflow-hidden border border-white/[0.12]">
              <span className="block text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider px-2.5 py-2 pb-1">Reference Image</span>
              <img src={t.reference_image} alt="reference" className="w-full block max-h-[200px] object-cover" />
            </div>
          )}

          {t.delete_requested_by ? (
            <div className="mt-auto flex flex-col gap-2 p-3 rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)]">
              <span className="text-xs text-[#fca5a5] font-semibold text-center">Delete requested by {t.delete_requested_by_name || 'User'}</span>
              {isCreator ? (
                <div className="flex gap-2">
                  <button type="button" className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer" onClick={() => handleApproveDelete(t.id)}>Approve</button>
                  <button type="button" className="flex-1 bg-gray-500 hover:bg-gray-600 text-white rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer" onClick={() => handleRejectDelete(t.id)}>Reject</button>
                </div>
              ) : (
                <span className="text-[10px] text-center text-[#fca5a5]/70">Pending approval...</span>
              )}
            </div>
          ) : (
            <button type="button" className="mt-auto border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] text-[#fca5a5] rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer hover:bg-[rgba(239,68,68,0.22)]" onClick={() => handleDelete(t.id)}>Delete Task</button>
          )}
        </div>

        {/* RIGHT */}
        <div className="flex flex-col bg-[#f8faff] overflow-hidden">
          <div className="flex gap-0 border-b-2 border-gray-200 bg-white px-6">
            {['details', 'edit', 'comments'].map(tab => (
              <button key={tab} type="button"
                className={`px-4 py-3.5 text-sm font-bold border-b-[3px] mb-[-2px] cursor-pointer capitalize whitespace-nowrap bg-none ${sheetTab === tab ? 'text-[#1e40af] border-[#2f5dff]' : 'text-gray-500 border-transparent hover:text-[#2f5dff]'}`}
                onClick={() => setSheetTab(tab)}>
                {tab === 'details' ? 'Details' : tab === 'edit' ? 'Edit' : (
                  <span className="flex items-center gap-1.5">
                    Comments {t.total_comments > 0 && <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full">{t.total_comments}</span>}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">

            {/* DETAILS TAB */}
            {sheetTab === 'details' && (
              <div className="flex flex-col gap-4">
                <Sec title="Task Overview">
                  <Row label="Issue Type"><span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${type === 'bug' ? 'bg-red-100 text-red-700' : type === 'story' ? 'bg-purple-100 text-purple-700' : type === 'feature' ? 'bg-emerald-100 text-emerald-700' : type === 'enhancement' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>{type.toUpperCase()}</span></Row>
                  <Row label="Status"><span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${t.status === 'DONE' ? 'bg-green-100 text-green-700' : t.status === 'IN_PROGRESS' ? 'bg-sky-100 text-sky-700' : t.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>{STATUS_LABEL[t.status] || t.status}</span></Row>
                  <Row label="Priority"><span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${t.priority === 'HIGH' ? 'bg-red-100 text-red-700' : t.priority === 'LOW' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>{t.priority || 'MEDIUM'}</span></Row>
                  <Row label="Assignee">{val(t.assigned_to_name)}</Row>
                  <Row label="Assigned By">{val(t.assigned_by_name)}</Row>
                  {t.client_name && <Row label="Client Name">{t.client_name}</Row>}
                </Sec>

                <Sec title="Timeline">
                  <Row label="Assigned Date">{dateLabel(t.assigned_date)}</Row>
                  <Row label="Start Date">{dateLabel(t.start_date)}</Row>
                  <Row label="Due Date">{dateLabel(t.due_date)}</Row>
                </Sec>

                {type === 'bug'         && <BugDetailSec t={t} />}
                {type === 'feature'     && <FeatureDetailSec t={t} />}
                {type === 'enhancement' && <EnhDetailSec t={t} />}
                {type === 'story'       && <StoryDetailSec t={t} />}
                {(type === 'task' || !type) && <TaskClassSec t={t} />}
              </div>
            )}

            {/* EDIT TAB */}
            {sheetTab === 'edit' && (
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <Sel label="Status" value={t.status} onChange={e => up('status', e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </Sel>
                  <Sel label="Priority" value={t.priority} onChange={e => up('priority', e.target.value)}>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </Sel>
                </div>

                <Sel label="Assignee" value={t.assigned_to || ''} onChange={e => up('assigned_to', e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Sel>

                <Inp label="Client Name" value={t.client_name || ''} onChange={e => up('client_name', e.target.value)} placeholder="Client or project name" />

                {/* Issue-type specific edit fields */}
                <div className="grid grid-cols-3 gap-3">
                  {type === 'bug'         && <BugEditFields      t={t} up={up} />}
                  {type === 'feature'     && <FeatureEditFields   t={t} up={up} />}
                  {type === 'enhancement' && <EnhEditFields       t={t} up={up} />}
                  {type === 'story'       && <StoryEditFields     t={t} up={up} />}
                  {(type === 'task' || !type) && <TaskEditFields  t={t} up={up} opts={availableTaskOptions} cats={selectedTaskCategories} />}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Inp label="Assigned Date" type="date" value={toInputDate(t.assigned_date)} onChange={e => up('assigned_date', e.target.value)} />
                  <Inp label="Start Date" type="date" value={toInputDate(t.start_date)} onChange={e => up('start_date', e.target.value)} />
                  <Inp label="End Date" type="date" value={toInputDate(t.due_date)} onChange={e => up('due_date', e.target.value)} />
                </div>
              </div>
            )}

            {sheetTab === 'comments' && (
              <div className="min-h-[200px]"><TaskComments taskId={t.id} /></div>
            )}
          </div>
        </div>

      </aside>
    </div>
  );
};

export default TaskDetailModal;
