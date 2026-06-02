import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TeamChat from '../components/TeamChat';
import './TeamWorkspaceRoom.css';

const allowedTabs = new Set(['discussion', 'live', 'history']);

const TeamWorkspaceRoom = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const teamId = Number(searchParams.get('teamId') || 0) || null;
  const threadId = Number(searchParams.get('threadId') || 0) || null;
  const requestedTab = String(searchParams.get('tab') || 'discussion');
  const initialTab = allowedTabs.has(requestedTab) ? requestedTab : 'discussion';

  return (
    <div className="workspace-room-page">
      <div className="workspace-room-page__bg" />
      <header className="workspace-room-page__head">
        <div>
          <span>Team Workspace</span>
          <h1>Full screen chat, threads, and live review workspace</h1>
        </div>
        <button type="button" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </header>

      <TeamChat standalone startOpen initialTeamId={teamId} initialThreadId={threadId} initialTab={initialTab} />
    </div>
  );
};

export default TeamWorkspaceRoom;
