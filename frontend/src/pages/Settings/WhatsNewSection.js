import React from 'react';
import UpdatesButton from '../../components/Updates/UpdatesButton';
import { ExternalIcon, SparkIcon } from '../../components/shell/icons';
import Section from './Section';

const PARTS = [
  ['Latest updates', 'New features and improvements, newest first, with the date they went live.'],
  ['Step-by-step guides', 'Every update explains why it helps and how to use it, one step at a time.'],
  ['Private problem reports', 'Something not working? Report it to one person privately. Reports assigned to you are in My Tasks → Private reports.'],
];

// Product updates live on their own page; Settings links to it and explains what is there.
export default function WhatsNewSection() {
  return (
    <Section title="What's new & guides" description="New features and how-to guides from your admins. They open on their own page in a new tab, so you keep your place here."
      actions={<UpdatesButton />}>
      <a href="/updates" target="_blank" rel="noopener noreferrer"
        className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-5 transition hover:border-accent hover:shadow-sm">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><SparkIcon /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-accent">GreenTask · What's new</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-base font-semibold">Product updates <span className="text-muted group-hover:text-accent"><ExternalIcon /></span></span>
          <span className="mt-0.5 block text-sm text-muted">Discover improvements, learn the steps, and report a problem privately.</span>
        </span>
        <span className="hidden text-sm font-medium text-accent sm:block">Opens in a new tab →</span>
      </a>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PARTS.map(([title, text], index) => (
          <div key={title} className="rounded-lg border border-line bg-surface p-4">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-subtle text-xs font-bold text-muted">{index + 1}</span>
            <p className="mt-2 text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-sm text-muted">{text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
