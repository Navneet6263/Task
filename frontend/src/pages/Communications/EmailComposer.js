import React, { useState, useEffect } from 'react';
import { communications } from '../../services/api';

const InputRow = ({ icon, label, children }) => (
  <div className="group flex items-center gap-3 bg-slate-50/80 px-4 py-3 rounded-2xl border border-slate-100 hover:border-slate-200 focus-within:bg-white focus-within:border-blue-400 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.08)] transition-all duration-200">
    <div className="flex items-center gap-3 w-24 flex-shrink-0">
      <span className="text-slate-300 group-focus-within:text-blue-400 transition-colors">{icon}</span>
      <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</label>
    </div>
    <div className="w-px h-4 bg-slate-200 flex-shrink-0" />
    {children}
  </div>
);

const EmailComposer = ({ template, taskContext }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('idle');
  const charCount = body.length;

  useEffect(() => {
    if (template) {
      setSubject(template.subject || '');
      setBody(template.body || '');
    }
  }, [template]);

  const handleSend = async () => {
    if (!to || !subject || !body) {
      alert('Please fill out To, Subject, and Body fields.');
      return;
    }
    setStatus('sending');
    try {
      await communications.send({ to, cc, subject, text: body });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3500);
      setTo(''); setCc(''); setSubject(''); setBody('');
    } catch (error) {
      console.error(error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* Top gradient bar */}
      <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 flex-shrink-0" />

      <div className="flex-1 flex flex-col overflow-y-auto px-8 py-7">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-black text-slate-900 tracking-tight">Compose Email</h1>
            <p className="text-sm font-medium text-slate-400 mt-1">
              {template && template.id !== 'blank' ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-base">{template.emoji}</span>
                  <span className="text-indigo-600 font-semibold">{template.name}</span>
                  <span className="text-slate-400">template applied</span>
                </span>
              ) : 'Start fresh or select a template from the left.'}
            </p>
          </div>

          {/* Status pill */}
          {status === 'success' && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold px-4 py-2 rounded-xl animate-bounce-once">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Sent!
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold px-4 py-2 rounded-xl">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Failed to send
            </div>
          )}
        </div>

        {/* Task context banner */}
        {taskContext && (
          <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100/80 flex items-start gap-3.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-black text-blue-700 uppercase tracking-wide">From Task</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  taskContext.issue_type === 'bug' ? 'bg-red-100 text-red-700' :
                  taskContext.issue_type === 'feature' ? 'bg-purple-100 text-purple-700' :
                  taskContext.issue_type === 'story' ? 'bg-pink-100 text-pink-700' :
                  taskContext.issue_type === 'enhancement' ? 'bg-orange-100 text-orange-700' :
                  'bg-blue-100 text-blue-700'
                }`}>{(taskContext.issue_type || 'task').toUpperCase()}</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  taskContext.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                  taskContext.priority === 'LOW' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>{taskContext.priority || 'MEDIUM'}</span>
              </div>
              <p className="text-sm font-bold text-slate-800 truncate">{taskContext.title}</p>
              {taskContext.client_name && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Client: <span className="font-semibold text-slate-700">{taskContext.client_name}</span>
                  <span className="ml-2 text-slate-400">— Add their email in the To field</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Email Fields */}
        <div className="flex flex-col gap-2.5 mb-4">
          <InputRow label="To" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          }>
            <input type="email" placeholder="recipient@company.com" value={to} onChange={e => setTo(e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300" />
          </InputRow>

          <InputRow label="CC" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          }>
            <input type="email" placeholder="optional@company.com" value={cc} onChange={e => setCc(e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300" />
          </InputRow>

          <InputRow label="Subject" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="14" y2="15"/><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" opacity=".3"/></svg>
          }>
            <input type="text" placeholder="Email subject line..." value={subject} onChange={e => setSubject(e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300" />
          </InputRow>
        </div>

        {/* Message body */}
        <div className="flex-1 flex flex-col rounded-2xl border border-slate-100 hover:border-slate-200 focus-within:border-blue-400 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.06)] transition-all duration-200 overflow-hidden bg-slate-50/60 min-h-[200px]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white/80">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Message Body
            </span>
            <div className="flex items-center gap-3">
              {template && template.id !== 'blank' && (
                <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  TEMPLATE APPLIED
                </span>
              )}
              <span className={`text-[11px] font-bold ${charCount > 1000 ? 'text-amber-500' : 'text-slate-300'}`}>{charCount} chars</span>
            </div>
          </div>
          <textarea
            placeholder="Start typing your message here..."
            value={body}
            onChange={e => setBody(e.target.value)}
            className="flex-1 w-full px-5 py-4 bg-transparent text-[14px] text-slate-700 outline-none resize-none placeholder:text-slate-300 leading-relaxed font-medium min-h-[180px]"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 pb-1 mt-2">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Sent via secure SMTP
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setTo(''); setCc(''); setSubject(''); setBody(''); }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={status === 'sending'}
              onClick={handleSend}
              className={`flex items-center gap-2.5 px-7 py-3 rounded-2xl font-black text-white text-sm transition-all duration-300 ${
                status === 'sending'
                  ? 'bg-blue-400 cursor-wait opacity-80'
                  : 'bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-[0_8px_20px_rgba(59,130,246,0.35)] hover:shadow-[0_12px_28px_rgba(59,130,246,0.45)] hover:-translate-y-0.5 active:translate-y-0'
              }`}
            >
              {status === 'sending' ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                  Sending...
                </>
              ) : (
                <>
                  Send Email
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EmailComposer;
