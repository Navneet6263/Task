import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TeamChat from '../components/TeamChat';
import './LiveReviewRoom.css';

const LiveReviewRoom = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const teamId = Number(searchParams.get('teamId') || 0) || null;

  return (
    <div className="live-room-page">
      <div className="live-room-page__bg" />
      <header className="live-room-page__head">
        <div>
          <span>Live Review Room</span>
          <h1>Dedicated screen share and notes workspace</h1>
        </div>
        <button type="button" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </header>

      <TeamChat standalone startOpen initialTeamId={teamId} initialTab="live" />
    </div>
  );
};

export default LiveReviewRoom;
