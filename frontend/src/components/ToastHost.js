import React, { useEffect, useState } from 'react';
export default function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const timers = new Set();
    const add = event => {
      const item = event.detail;
      setItems(prev => [...prev.slice(-2), item]);
      if (item.tone === 'success') {
        const timer = setTimeout(() => { setItems(prev => prev.filter(row => row.id !== item.id)); timers.delete(timer); }, 5000);
        timers.add(timer);
      }
    };
    window.addEventListener('workspace:notice', add);
    return () => { window.removeEventListener('workspace:notice', add); timers.forEach(clearTimeout); };
  }, []);
  return <div className="fixed bottom-5 right-5 z-[250] flex max-w-[min(420px,90vw)] flex-col gap-2">
    {items.map(item => <div key={item.id} role={item.tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border bg-surface p-4 text-sm shadow-xl motion-safe:animate-fade-up ${item.tone === 'error' ? 'border-danger/30 text-danger' : 'border-accent/30 text-accent'}`}><span>{item.message}</span><button type="button" aria-label="Dismiss message" onClick={() => setItems(prev => prev.filter(row => row.id !== item.id))}>×</button></div>)}
  </div>;
}
