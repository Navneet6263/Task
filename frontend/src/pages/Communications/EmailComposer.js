import React, { useState, useEffect } from 'react';
import { communications } from '../../services/api';

const EmailComposer = ({ template }) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('idle'); // idle, sending, success, error

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
      setTimeout(() => setStatus('idle'), 3000);
      setTo('');
      setCc('');
      setSubject('');
      setBody('');
    } catch (error) {
      console.error(error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white h-full p-8 rounded-r-[32px] overflow-y-auto">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-black text-slate-900 tracking-tight">Compose Email</h1>
        <p className="text-sm font-medium text-slate-500 mt-1">Send a direct message to your client or team.</p>
      </header>

      <div className="flex-1 flex flex-col max-w-4xl space-y-6">
        
        <div className="group flex items-center bg-[#f8fafc] px-4 py-3.5 rounded-2xl border border-transparent hover:border-slate-200 focus-within:bg-white focus-within:border-blue-500 focus-within:shadow-[0_4px_16px_rgba(59,130,246,0.08)] transition-all duration-300">
          <label className="w-16 text-xs font-extrabold text-slate-400 uppercase tracking-wider">To</label>
          <input 
            type="email" 
            placeholder="client@example.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-transparent text-[15px] font-bold text-slate-800 outline-none placeholder:text-slate-300 placeholder:font-medium"
          />
        </div>

        <div className="group flex items-center bg-[#f8fafc] px-4 py-3.5 rounded-2xl border border-transparent hover:border-slate-200 focus-within:bg-white focus-within:border-blue-500 focus-within:shadow-[0_4px_16px_rgba(59,130,246,0.08)] transition-all duration-300">
          <label className="w-16 text-xs font-extrabold text-slate-400 uppercase tracking-wider">CC</label>
          <input 
            type="email" 
            placeholder="manager@example.com (Optional)"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            className="flex-1 bg-transparent text-[15px] font-bold text-slate-800 outline-none placeholder:text-slate-300 placeholder:font-medium"
          />
        </div>

        <div className="group flex items-center bg-[#f8fafc] px-4 py-3.5 rounded-2xl border border-transparent hover:border-slate-200 focus-within:bg-white focus-within:border-blue-500 focus-within:shadow-[0_4px_16px_rgba(59,130,246,0.08)] transition-all duration-300">
          <label className="w-16 text-xs font-extrabold text-slate-400 uppercase tracking-wider">Subject</label>
          <input 
            type="text" 
            placeholder="Email Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-[15px] font-bold text-slate-800 outline-none placeholder:text-slate-300 placeholder:font-medium"
          />
        </div>

        <div className="flex-1 flex flex-col bg-[#f8fafc] rounded-3xl border border-transparent hover:border-slate-200 focus-within:bg-white focus-within:border-blue-500 focus-within:shadow-[0_8px_24px_rgba(59,130,246,0.08)] transition-all duration-300 overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between bg-slate-50 border-b border-slate-100">
            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Message</span>
            {template && template.id !== 'blank' && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1.5 shadow-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                TEMPLATE APPLIED
              </span>
            )}
          </div>
          <textarea 
            placeholder="Start typing your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="flex-1 w-full p-6 bg-transparent text-[15px] text-slate-700 outline-none resize-none placeholder:text-slate-300 leading-relaxed font-medium"
          />
        </div>

        <div className="flex items-center justify-between pt-6 pb-2">
          <div className="text-sm font-extrabold">
            {status === 'success' && <span className="text-emerald-500 flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Email sent successfully!</span>}
            {status === 'error' && <span className="text-rose-500 bg-rose-50 px-4 py-2 rounded-xl">Failed to send email. Check backend config.</span>}
          </div>
          <button 
            type="button" 
            disabled={status === 'sending'}
            onClick={handleSend}
            className={`flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-white transition-all duration-300 ${
              status === 'sending' ? 'bg-blue-400 cursor-wait' : 'bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-[0_8px_24px_rgba(59,130,246,0.35)] hover:shadow-[0_12px_32px_rgba(59,130,246,0.45)] hover:-translate-y-1 active:translate-y-0'
            }`}
          >
            {status === 'sending' ? 'Sending...' : 'Send Message'}
            {status !== 'sending' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default EmailComposer;
