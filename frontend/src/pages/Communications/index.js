import React, { useState } from 'react';
import TemplateSelector from './TemplateSelector';
import EmailComposer from './EmailComposer';

const Communications = () => {
  const [activeTemplate, setActiveTemplate] = useState(null);

  return (
    <div className="min-h-full flex flex-col p-6 max-w-[1600px] mx-auto gap-6 animate-in fade-in duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 tracking-tight">Client Communications</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Send updates, invoices, and direct messages to clients.</p>
        </div>
      </header>

      <section className="flex-1 bg-white rounded-[32px] border border-slate-200/60 shadow-lg shadow-slate-200/50 flex overflow-hidden min-h-[600px]">
        <TemplateSelector activeTemplate={activeTemplate} onSelect={setActiveTemplate} />
        <EmailComposer template={activeTemplate} />
      </section>
    </div>
  );
};

export default Communications;
