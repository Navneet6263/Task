import React from 'react';

/* ── Shared styled atoms ────────────────────────────────────────────────── */
const cls = `h-[42px] rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm px-3.5
  focus:border-[#2f5dff] focus:ring-3 focus:ring-blue-50 transition-all outline-none w-full`;

const Fld = ({ label, req, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-xs font-bold text-gray-700">{label}{req && <span className="text-red-400"> *</span>}</span>
    {children}
  </label>
);
const Sel = ({ opts = [], placeholder, ...p }) => (
  <select className={cls} {...p}>
    {placeholder && <option value="">{placeholder}</option>}
    {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);
const Inp = (p) => <input className={cls} {...p} />;
const Txt = (p) => <textarea className={`${cls} min-h-[80px] resize-y h-auto py-2.5 leading-relaxed`} {...p} />;

/* ── Bug fields ─────────────────────────────────────────────────────────── */
const BugFields = ({ f, u }) => (
  <>
    <Fld label="Severity" req><Sel value={f.severity||'MEDIUM'} onChange={e=>u('severity',e.target.value)} opts={[{v:'CRITICAL',l:'Critical'},{v:'HIGH',l:'High'},{v:'MEDIUM',l:'Medium'},{v:'LOW',l:'Low'}]} /></Fld>
    <Fld label="Bug Type"><Sel value={f.bug_type||''} onChange={e=>u('bug_type',e.target.value)} placeholder="Select bug type" opts={[{v:'UI',l:'UI Issue'},{v:'FUNCTIONAL',l:'Functional'},{v:'PERFORMANCE',l:'Performance'},{v:'SECURITY',l:'Security'},{v:'DATA',l:'Data Issue'}]} /></Fld>
    <Fld label="Environment"><Sel value={f.environment||''} onChange={e=>u('environment',e.target.value)} placeholder="Select env" opts={[{v:'PRODUCTION',l:'Production'},{v:'STAGING',l:'Staging'},{v:'DEV',l:'Development'},{v:'QA',l:'QA'}]} /></Fld>
    <Fld label="Affected Module"><Inp placeholder="e.g. Login, Dashboard" value={f.affected_module||''} onChange={e=>u('affected_module',e.target.value)} /></Fld>
    <div className="col-span-3"><Fld label="Steps to Reproduce"><Txt placeholder={"1. Go to...\n2. Click...\n\nExpected: ...\nActual: ..."} value={f.steps_to_reproduce||''} onChange={e=>u('steps_to_reproduce',e.target.value)} /></Fld></div>
  </>
);

/* ── Feature fields ──────────────────────────────────────────────────────── */
const FeatureFields = ({ f, u }) => (
  <>
    <Fld label="Feature Area"><Sel value={f.feature_area||''} onChange={e=>u('feature_area',e.target.value)} placeholder="Select area" opts={[{v:'AUTH',l:'Authentication'},{v:'DASHBOARD',l:'Dashboard'},{v:'REPORTS',l:'Reports'},{v:'PAYMENTS',l:'Payments'},{v:'API',l:'API'},{v:'UI_UX',l:'UI/UX'},{v:'OTHER',l:'Other'}]} /></Fld>
    <Fld label="Story Points"><Sel value={f.story_points||''} onChange={e=>u('story_points',e.target.value)} placeholder="Estimate effort" opts={[{v:'1',l:'1 – XS'},{v:'2',l:'2 – S'},{v:'3',l:'3 – M'},{v:'5',l:'5 – L'},{v:'8',l:'8 – XL'},{v:'13',l:'13 – XXL'}]} /></Fld>
    <Fld label="Priority"><Sel value={f.feature_priority||''} onChange={e=>u('feature_priority',e.target.value)} placeholder="MoSCoW" opts={[{v:'MUST_HAVE',l:'Must Have'},{v:'SHOULD_HAVE',l:'Should Have'},{v:'NICE_TO_HAVE',l:'Nice to Have'}]} /></Fld>
    <div className="col-span-3"><Fld label="Acceptance Criteria" req><Txt placeholder={"• User can...\n• System should...\n• When X happens, Y occurs"} value={f.acceptance_criteria||''} onChange={e=>u('acceptance_criteria',e.target.value)} /></Fld></div>
  </>
);

/* ── Enhancement fields ─────────────────────────────────────────────────── */
const EnhancementFields = ({ f, u }) => (
  <>
    <Fld label="Enhancement Type"><Sel value={f.enhancement_type||''} onChange={e=>u('enhancement_type',e.target.value)} placeholder="Select type" opts={[{v:'PERFORMANCE',l:'Performance'},{v:'UX',l:'UX Improvement'},{v:'ACCESSIBILITY',l:'Accessibility'},{v:'REFACTOR',l:'Refactor'},{v:'SECURITY',l:'Security'}]} /></Fld>
    <Fld label="Impact Level"><Sel value={f.impact_level||''} onChange={e=>u('impact_level',e.target.value)} placeholder="Select impact" opts={[{v:'HIGH',l:'High – Many users'},{v:'MEDIUM',l:'Medium – Noticeable'},{v:'LOW',l:'Low – Minor'}]} /></Fld>
    <Fld label="Effort Estimate"><Sel value={f.effort_estimate||''} onChange={e=>u('effort_estimate',e.target.value)} placeholder="Select effort" opts={[{v:'XS',l:'XS – <2 hrs'},{v:'S',l:'S – Half day'},{v:'M',l:'M – 1-2 days'},{v:'L',l:'L – 3-5 days'},{v:'XL',l:'XL – 1+ week'}]} /></Fld>
    <div className="col-span-3"><Fld label="What to Improve"><Txt placeholder="Describe current state and what the improved version should be..." value={f.improvement_detail||''} onChange={e=>u('improvement_detail',e.target.value)} /></Fld></div>
  </>
);

/* ── Story fields ────────────────────────────────────────────────────────── */
const StoryFields = ({ f, u }) => (
  <>
    <Fld label="Story Role"><Sel value={f.story_role||''} onChange={e=>u('story_role',e.target.value)} placeholder="Select role" opts={[{v:'CONTENT_WRITER',l:'Content Writer'},{v:'SEO',l:'SEO Specialist'},{v:'DEVELOPER',l:'Developer'},{v:'DESIGNER',l:'Designer'},{v:'MARKETING',l:'Marketing'},{v:'QA',l:'QA Tester'}]} /></Fld>
    <Fld label="Story Points"><Sel value={f.story_points||''} onChange={e=>u('story_points',e.target.value)} placeholder="Estimate" opts={[{v:'1',l:'1 – XS'},{v:'2',l:'2 – S'},{v:'3',l:'3 – M'},{v:'5',l:'5 – L'},{v:'8',l:'8 – XL'}]} /></Fld>
    <Fld label="Epic / Theme"><Inp placeholder="e.g. SEO Q3 Sprint" value={f.epic||''} onChange={e=>u('epic',e.target.value)} /></Fld>
    <Fld label="User Persona"><Inp placeholder="e.g. First-time visitor" value={f.persona||''} onChange={e=>u('persona',e.target.value)} /></Fld>
    <div className="col-span-3"><Fld label="Content / SEO Notes"><Txt placeholder={f.story_role==='SEO'?'Target keyword, meta description, internal linking...':f.story_role==='CONTENT_WRITER'?'Tone of voice, word count, key points...':'As a [role], I want [goal], so that [reason]...'} value={f.story_notes||''} onChange={e=>u('story_notes',e.target.value)} /></Fld></div>
  </>
);

/* ── General Task fields ─────────────────────────────────────────────────── */
const TaskFields = ({ f, u, opts, cats }) => (
  <>
    <Fld label="Task Type"><Sel value={f.task_type} onChange={e=>u('task_type',e.target.value)} placeholder="Select task type" opts={opts.task_types.map(o=>({v:o.label,l:o.label}))} /></Fld>
    <Fld label="Product / Module"><Sel value={f.product} onChange={e=>u('product',e.target.value)} placeholder="Select product" opts={opts.products.map(o=>({v:o.label,l:o.label}))} /></Fld>
    <Fld label="Category"><Sel value={f.category} onChange={e=>u('category',e.target.value)} placeholder="Select category" opts={cats.map(o=>({v:o.label,l:o.label}))} /></Fld>
  </>
);

/* ── Accent map ─────────────────────────────────────────────────────────── */
const ACCENT = { bug:'border-l-red-400 bg-red-50', feature:'border-l-emerald-400 bg-emerald-50', enhancement:'border-l-amber-400 bg-amber-50', story:'border-l-purple-400 bg-purple-50', task:'border-l-blue-400 bg-blue-50' };
const TITLES = { bug:'Bug Details', feature:'Feature Requirements', enhancement:'Enhancement Details', story:'Story Details', task:'Task Setup' };

/* ── Main export ─────────────────────────────────────────────────────────── */
const TaskSetupSection = ({ taskForm: f, updateTaskFormField: u, availableTaskOptions: opts, createTaskCategories: cats }) => {
  const type = f.issue_type || 'task';
  return (
    <section className="rounded-2xl border border-[#dbe7ff] bg-white shadow-[0_8px_24px_rgba(148,163,184,0.10)] px-5 py-5 flex flex-col gap-4">
      <div>
        <h4 className="text-[15px] font-bold text-gray-900 tracking-tight">{TITLES[type]||'Task Setup'}</h4>
        <p className="mt-0.5 text-xs text-gray-500">Fields adapt automatically based on your selected issue type.</p>
      </div>

      {/* Client Name — always visible */}
      <div className={`rounded-xl border-l-4 ${ACCENT[type]||ACCENT.task} px-3.5 py-3`}>
        <Fld label="Client Name"><Inp placeholder="Enter client or project name" value={f.client_name||''} onChange={e=>u('client_name',e.target.value)} /></Fld>
      </div>

      {/* Dynamic fields */}
      <div className="grid grid-cols-3 gap-3">
        {type==='bug'         && <BugFields         f={f} u={u} />}
        {type==='feature'     && <FeatureFields      f={f} u={u} />}
        {type==='enhancement' && <EnhancementFields  f={f} u={u} />}
        {type==='story'       && <StoryFields        f={f} u={u} />}
        {(type==='task'||!type) && <TaskFields       f={f} u={u} opts={opts} cats={cats} />}
      </div>
    </section>
  );
};

export default TaskSetupSection;
