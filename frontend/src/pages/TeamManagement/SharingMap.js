import React, { useEffect, useState } from 'react';
import { teams } from '../../services/api';
import { Button, Chip, Modal } from '../../ui';

// Every share in the organization(s) at a glance: which team's tasks reach which other team.
export default function SharingMap({ onOpen, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { teams.sharingOverview().then((r) => setRows(r.data)).catch(() => setRows([])); }, []);

  const pairs = new Set((rows || []).map((r) => `${r.team_id}>${r.viewer_team_id}`));
  // Two-way shares appear once; one-way shares keep their direction.
  const links = (rows || []).filter((r) => !(pairs.has(`${r.viewer_team_id}>${r.team_id}`) && Number(r.viewer_team_id) < Number(r.team_id)))
    .map((r) => ({ ...r, both: pairs.has(`${r.viewer_team_id}>${r.team_id}`) }));

  return (
    <Modal size="md" title="Team sharing" subtitle="Which teams see and work on which team's tasks." onClose={onClose}
      footer={<><span className="flex-1" /><Button onClick={onClose}>Close</Button></>}>
      {rows === null && <p role="status" className="text-sm text-muted">Loading…</p>}
      {rows && !links.length && <p className="text-sm text-muted">No teams are shared yet. Open a team and use "Share with another team".</p>}
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={`${link.team_id}-${link.viewer_team_id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2.5">
            <button type="button" className="font-semibold hover:text-accent" onClick={() => onOpen(link.team_id)}>{link.team_name}</button>
            <span className="font-mono text-sm text-accent" aria-hidden="true">{link.both ? '⇄' : '→'}</span>
            <button type="button" className="font-semibold hover:text-accent" onClick={() => onOpen(link.viewer_team_id)}>{link.viewer_name}</button>
            <span className="flex-1" />
            <Chip tone={link.both ? 'ok' : 'info'}>{link.both ? 'Work together' : `${link.viewer_name} sees ${link.team_name}`}</Chip>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
