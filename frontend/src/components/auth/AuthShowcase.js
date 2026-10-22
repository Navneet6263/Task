import React from 'react';
import BrandLogo from '../BrandLogo';
import { AuthIcon } from './AuthFields';

const CONTENT = {
  workspace: {
    badge: 'Your team, in one place',
    heading: 'Plan the work. Track the time. Ship on schedule.',
    text: 'Tasks, time tracking, calendar, chat and reports for every team in your company.',
    points: ['Tasks with boards, priorities and deadlines', 'Your own task form, hours per person and Excel reports', 'Calendar, quick chat and 1:1 screen share'],
  },
  security: {
    badge: 'Secure access',
    heading: 'Every sign-in is checked. Every action is logged.',
    text: 'Role-based access keeps each person to the work and data they are allowed to see.',
    points: ['Access based on each person\'s role', 'Audit log of who changed what', 'Reset links expire after 15 minutes'],
  },
  onboarding: {
    badge: 'Company setup',
    heading: 'Bring your whole company onto GreenTask.',
    text: 'Tell us about your company. After approval, you invite managers and they set up their teams.',
    points: ['Four short steps, about 3 minutes', 'Reviewed and approved by our team', 'Invite managers and staff after approval'],
  },
};

const TASKS = [
  ['Client onboarding deck', 'In progress', 'bg-sky-400/20 text-sky-200', 72],
  ['Q3 payroll run', 'Review', 'bg-amber-400/20 text-amber-200', 90],
  ['Website bug fixes', 'Done', 'bg-emerald-300/20 text-emerald-200', 100],
];

// The brand panel next to sign-in forms. Permanently dark green, so it uses fixed white tones.
export default function AuthShowcase({ variant = 'workspace' }) {
  const content = CONTENT[variant] || CONTENT.workspace;
  return (
    <aside aria-hidden="true" className="hidden p-3 lg:block lg:sticky lg:top-0 lg:h-[calc(100vh/0.9)]">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0a3326] via-[#0e5039] to-[#147457] p-10 text-white xl:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-teal-200/10 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <BrandLogo inverse />
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/85">{content.badge}</span>
        </div>

        <div className="relative mt-auto max-w-[520px] pt-10">
          <h2 className="text-[34px] font-bold leading-[1.15] tracking-tight xl:text-[40px]">{content.heading}</h2>
          <p className="mt-3 text-base leading-relaxed text-white/75">{content.text}</p>
          <ul className="mt-5 flex flex-col gap-2.5">
            {content.points.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-sm text-white/90">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15 text-emerald-200"><AuthIcon name="check" size={12} /></span>{point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-10 mb-auto">
          <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 shadow-2xl backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Today · Design team</p>
              <div className="flex -space-x-2">
                {['NK', 'RA', 'PS', 'MJ'].map((name, index) => (
                  <span key={name} className={`grid h-7 w-7 place-items-center rounded-full border-2 border-[#0e5039] text-[10px] font-bold ${['bg-emerald-300 text-emerald-950', 'bg-sky-300 text-sky-950', 'bg-amber-200 text-amber-950', 'bg-rose-200 text-rose-950'][index]}`}>{name}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {TASKS.map(([title, status, tone, done]) => (
                <div key={title} className="rounded-xl bg-white/[0.06] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${done}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -right-3 -top-8 flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-[#0a3326] shadow-xl">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><AuthIcon name="check" /></span>
            <span><span className="block text-xs font-bold">Task approved</span><span className="block text-[11px] text-slate-500">Priya · 2 min ago</span></span>
          </div>
          <div className="absolute -bottom-6 -left-4 rounded-xl bg-white px-3.5 py-2.5 text-[#0a3326] shadow-xl">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">This week</span>
            <span className="block text-lg font-bold">38.5 h <span className="text-xs font-semibold text-emerald-600">logged</span></span>
          </div>
        </div>
      </div>
    </aside>
  );
}
