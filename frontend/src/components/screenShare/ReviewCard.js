import React, { useEffect, useState } from 'react';
import { chat } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Chip, Segmented, Textarea } from '../../ui';

const duration = (s) => {
  const a = new Date(s.started_at).getTime(), b = new Date(s.ended_at || Date.now()).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return '—';
  const m = Math.max(1, Math.round((b - a) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const STATUS = { active: ['danger', 'Live'], awaiting_review: ['warn', 'Waiting for review'], approved: ['ok', 'Approved'], rejected: ['danger', 'Rejected'], ended: ['neutral', 'Ended'] };
export const SessionStatus = ({ status }) => { const [tone, label] = STATUS[status] || ['neutral', status]; return <Chip tone={tone}>{label}</Chip>; };

// After a share ends a manager can approve or reject what was shown.
export function ReviewCard({ live, selfId }) {
  const { session } = live;
  const [decision, setDecision] = useState('approved');
  const [remark, setRemark] = useState('');
  const canDecide = live.canReview && Number(session.sharer_id) !== Number(selfId);
  const save = async () => {
    if (!remark.trim()) { notify('Add a short remark for the record.'); return; }
    if (await live.decide(decision, remark.trim())) notify(decision === 'approved' ? 'Approved.' : 'Marked as rejected.', 'success');
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{session.sharer_name}'s screen share has ended</p>
        <SessionStatus status={session.status} />
      </div>
      <p className="text-sm text-muted">{duration(session)} · {(session.participants || []).filter((p) => p.role === 'viewer').length} viewer(s){session.note ? ` · “${session.note}”` : ''}</p>
      {canDecide ? <>
        <Segmented label="Decision" value={decision} onChange={setDecision} options={[['approved', 'Approve'], ['rejected', 'Reject']]} />
        <Textarea placeholder="What did you check? Any changes needed?" value={remark} onChange={(e) => setRemark(e.target.value)} />
        <div><Button variant="primary" onClick={save}>Save review</Button></div>
      </> : <p className="text-sm">{session.status === 'awaiting_review' ? 'Waiting for a manager to review this session.' : session.decision_remark}</p>}
    </div>
  );
}

export function SessionHistory({ teamId, version }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { if (teamId) chat.sessions(teamId).then((r) => setRows(r.data.sessions || [])).catch(() => setRows([])); }, [teamId, version]);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Recent sessions</p>
      {rows === null && <p className="text-sm text-muted">Loading…</p>}
      {rows && !rows.length && <p className="text-sm text-muted">No screen shares yet in this team.</p>}
      <ul className="flex flex-col divide-y divide-line">
        {rows?.slice(0, 8).map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{s.note || `${s.sharer_name}'s screen`}</span>
              <span className="text-xs text-muted">{s.sharer_name} · {new Date(s.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {duration(s)}</span></span>
            <SessionStatus status={s.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
