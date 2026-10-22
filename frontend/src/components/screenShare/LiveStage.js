import React, { useEffect, useRef, useState } from 'react';
import { Button, Switch } from '../../ui';

const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function useElapsed(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const start = new Date(since).getTime();
  if (!since || Number.isNaN(start)) return '0:00';
  const s = Math.max(0, Math.floor((now - start) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function People({ session }) {
  const watching = (session.participants || []).filter((p) => p.role === 'viewer' && !p.left_at);
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Watching now · {watching.length}</p>
      <ul className="flex flex-col gap-1">
        {watching.map((p) => <li key={p.user_id} className="flex items-center gap-2 text-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">{initials(p.user_name)}</span>{p.user_name}<span className="ml-auto h-2 w-2 rounded-full bg-accent" /></li>)}
        {!watching.length && <li className="text-sm text-muted">Waiting for someone to join…</li>}
      </ul>
    </div>
  );
}

// The live view: your own preview when sharing, or the other person's screen when watching.
export default function LiveStage({ live, selfId }) {
  const { session, isSharer, viewerJoined, remoteLive } = live;
  const elapsed = useElapsed(session.started_at);
  const stageRef = useRef(null);
  const [mic, setMic] = useState(true);
  const fullscreen = () => stageRef.current?.requestFullscreen?.().catch(() => {});

  if (!isSharer && !viewerJoined) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-subtle px-6 py-10 text-center">
        <span className="relative grid h-16 w-16 place-items-center rounded-full bg-accent text-xl font-bold text-accent-fg">{initials(session.sharer_name)}<span className="absolute -right-1 -top-1 h-4 w-4 animate-pulse rounded-full border-2 border-subtle bg-danger" /></span>
        <div>
          <p className="text-lg font-semibold">{session.sharer_name} is sharing their screen</p>
          {session.note && <p className="mt-1 text-sm text-muted">“{session.note}”</p>}
          <p className="mt-1 text-xs text-muted">Live for {elapsed}</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={mic} onChange={setMic} label="Join with microphone" /> Join with my microphone</label>
        <Button variant="primary" className="px-8 py-2.5" disabled={Boolean(live.busy)} onClick={() => live.join({ mic })}>{live.busy === 'join' ? 'Joining…' : 'Watch now'}</Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div ref={stageRef} className="relative overflow-hidden rounded-xl bg-black">
        {isSharer
          ? <video ref={live.localVideoRef} autoPlay playsInline muted className="aspect-video w-full object-contain" />
          : <video ref={live.remoteVideoRef} autoPlay playsInline className="aspect-video w-full object-contain" />}
        {!isSharer && <audio ref={live.remoteAudioRef} autoPlay />}
        {!isSharer && !remoteLive && <div className="absolute inset-0 grid place-items-center text-sm text-white/70">Connecting to {session.sharer_name}'s screen…</div>}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE · {elapsed}
        </div>
        <button type="button" onClick={fullscreen} className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-black/80">Full screen</button>
      </div>
      <aside className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold">{isSharer ? 'You are sharing your screen' : `Watching ${session.sharer_name}`}</p>
          {session.note && <p className="mt-0.5 text-xs text-muted">“{session.note}”</p>}
        </div>
        <People session={session} selfId={selfId} />
        <div className="mt-auto flex flex-col gap-2">
          {isSharer
            ? <Button variant="danger" className="!border-danger/40 py-2.5" onClick={() => live.stop()}>Stop sharing</Button>
            : <Button className="py-2.5" onClick={() => live.leave()}>Leave</Button>}
          {live.status && <p className="text-center text-xs text-muted" role="status">{live.status}</p>}
        </div>
      </aside>
    </div>
  );
}
