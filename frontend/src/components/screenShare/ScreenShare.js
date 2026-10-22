import React, { useEffect, useState } from 'react';
import { teams as teamsApi } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { notify } from '../../services/feedback';
import { Button } from '../../ui';
import useDialog from '../useDialog';
import useLiveShare from './useLiveShare';
import StartShare from './StartShare';
import LiveStage from './LiveStage';
import { ReviewCard, SessionHistory } from './ReviewCard';

// Screen sharing: a focused window to start or watch a share, plus a small floating bar
// that keeps the share visible while you use the rest of the app.
export default function ScreenShare({ open, onOpen, onClose, wsRef, socketVersion, preset }) {
  const self = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const [teamList, setTeamList] = useState([]);
  const [teamId, setTeamId] = useState(() => readPreference('screen-share-team', null));
  const [members, setMembers] = useState([]);
  const [invite, setInvite] = useState(null);
  const live = useLiveShare({ wsRef, socketVersion, teamId, selfId: self.id });
  const dialogRef = useDialog(open, () => close());

  useEffect(() => {
    teamsApi.getAll().then((r) => {
      setTeamList(r.data);
      setTeamId((current) => (r.data.some((t) => String(t.id) === String(current)) ? current : r.data[0]?.id ?? null));
    }).catch(() => {});
  }, []);
  // Opened from a 1:1 chat: switch to that team with the person already picked.
  useEffect(() => { if (preset?.teamId) setTeamId(String(preset.teamId)); }, [preset]);
  useEffect(() => { if (teamId) teamsApi.getMembers(teamId).then((r) => setMembers(r.data)).catch(() => setMembers([])); }, [teamId]);

  // Alerts when someone starts sharing with you (in any of your teams).
  useEffect(() => {
    const ws = wsRef?.current;
    if (!ws) return undefined;
    const onMessage = (event) => {
      try {
        const { event: type, data } = JSON.parse(event.data);
        if (type !== 'review_session_updated' || !data) return;
        if (data.status === 'active' && Number(data.sharer_id) !== Number(self.id)) {
          setInvite((current) => (current?.id === data.id ? current : data));
          if (!open) notify(`${data.sharer_name} started sharing their screen. Open "Share screen" to watch.`, 'success');
        } else if (data.status !== 'active') setInvite((current) => (current?.id === data.id ? null : current));
      } catch { /* ignore */ }
    };
    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [wsRef, socketVersion, open, self.id]);

  const pickTeam = (id) => { setTeamId(id); writePreference('screen-share-team', id); };
  function close() { if (live.viewerJoined) live.leave(); onClose(); }
  const watchInvite = () => { if (invite) pickTeam(String(invite.team_id)); setInvite(null); onOpen(); };
  const session = live.session;
  const team = teamList.find((t) => String(t.id) === String(teamId));

  return (
    <>
      {!open && live.isSharer && (
        <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-4 pr-1.5 shadow-pop">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /><span className="text-sm font-medium">You are sharing your screen</span>
          <Button size="sm" onClick={onOpen}>Open</Button>
          <Button size="sm" variant="danger" className="!border-danger/40" onClick={() => live.stop()}>Stop</Button>
        </div>
      )}
      {!open && !live.isSharer && invite && (
        <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface py-1.5 pl-4 pr-1.5 shadow-pop">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /><span className="text-sm font-medium">{invite.sharer_name} is sharing their screen</span>
          <Button size="sm" variant="primary" onClick={watchInvite}>Watch</Button>
          <button type="button" aria-label="Dismiss" className="px-2 text-muted hover:text-ink" onClick={() => setInvite(null)}>&times;</button>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Screen share" tabIndex={-1} className="my-4 w-full max-w-5xl rounded-xl border border-line bg-surface text-ink shadow-pop">
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
              <div className="min-w-0 flex-1"><h2 className="text-[17px] font-semibold">Screen share</h2><p className="text-sm text-muted">Show your screen to one person or your whole team, live.</p></div>
              <select aria-label="Team" value={teamId || ''} disabled={live.isSharer || live.viewerJoined} onChange={(e) => pickTeam(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
                {teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" aria-label="Close" onClick={close} className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">&times;</button>
            </header>
            <div className="p-5">
              {!team && <p className="py-10 text-center text-sm text-muted">Join a team to share your screen.</p>}
              {team && session?.status === 'active' && <LiveStage live={live} selfId={self.id} />}
              {team && session && session.status !== 'active' && session.status === 'awaiting_review' && <div className="mb-5"><ReviewCard live={live} selfId={self.id} /></div>}
              {team && session?.status !== 'active' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <StartShare key={`${teamId}-${preset?.at || 0}`} teamId={teamId} members={members} selfId={self.id} live={live} preset={String(preset?.teamId) === String(teamId) ? preset?.personId : null} />
                  <div className="lg:border-l lg:border-line lg:pl-6">
                    <SessionHistory teamId={teamId} version={session?.id + String(session?.status)} />
                    {live.status && <p className="mt-4 text-xs text-muted" role="status">{live.status}</p>}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
