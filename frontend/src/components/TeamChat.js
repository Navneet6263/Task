import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './TeamChat.css';
/* eslint-disable react-hooks/exhaustive-deps */

const BASE = 'http://localhost:5000/api';
const token = () => localStorage.getItem('token') || localStorage.getItem('company_token');
const api = () => axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token()}` } });
const me = () => {
  const stored = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  try {
    const payload = JSON.parse(atob(String(token()).split('.')[1] || ''));
    return { ...stored, id: stored.id || payload.id, role: stored.role || payload.role };
  } catch {
    return stored;
  }
};

const TeamChat = ({ wsRef, socketVersion }) => {
  const user = me();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('discussion');
  const [teams, setTeams] = useState([]);
  const [activeTeam, setActiveTeam] = useState(null);
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [threadTitle, setThreadTitle] = useState('');
  const [showThreadForm, setShowThreadForm] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [unread, setUnread] = useState({});
  const [liveSession, setLiveSession] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [shareMic, setShareMic] = useState(true);
  const [decision, setDecision] = useState('approved');
  const [decisionRemark, setDecisionRemark] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState({ start: false, join: false, review: false });

  const bottomRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const activeTeamRef = useRef(null);
  const activeThreadRef = useRef(null);
  const liveSessionRef = useRef(null);
  const joinedSessionRef = useRef(null);
  const localStreamRef = useRef(null);
  const displayStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peersRef = useRef(new Map());

  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + Number(b || 0), 0), [unread]);
  const isSharer = liveSession?.status === 'active' && Number(liveSession?.sharer_id) === Number(user.id);
  const viewerJoined = Boolean(
    (liveSession?.participants || []).some((item) => Number(item.user_id) === Number(user.id) && item.role === 'viewer' && !item.left_at)
  ) || joinedSessionRef.current === liveSession?.id;

  const joinRooms = (items = teams) => {
    const ws = wsRef?.current;
    if (!ws || !items.length) return;
    const send = () => items.forEach((team) => ws.send(JSON.stringify({ type: 'join', teamId: team.id })));
    if (ws.readyState === WebSocket.OPEN) send();
    else ws.addEventListener('open', send, { once: true });
  };

  const resetRemote = () => {
    remoteStreamRef.current = new MediaStream();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  };

  const cleanupMedia = () => {
    [localStreamRef.current, displayStreamRef.current, micStreamRef.current].forEach((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
    });
    localStreamRef.current = null;
    displayStreamRef.current = null;
    micStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const closePeers = () => {
    Array.from(peersRef.current.values()).forEach((pc) => {
      try { pc.close(); } catch {}
    });
    peersRef.current.clear();
    resetRemote();
  };

  const fetchTeams = async () => {
    try {
      const res = await api().get('/teams');
      const list = Array.isArray(res.data) ? res.data : [];
      setTeams(list);
      joinRooms(list);
      setActiveTeam((prev) => (prev && list.some((item) => item.id === prev.id) ? list.find((item) => item.id === prev.id) : list[0] || null));
    } catch {}
  };

  const fetchUnread = async () => {
    try {
      const res = await api().get('/chat/unread/counts');
      setUnread(res.data || {});
    } catch {}
  };

  const fetchThreads = async (teamId, keepId) => {
    try {
      const res = await api().get(`/chat/${teamId}/threads`);
      const list = Array.isArray(res.data?.threads) ? res.data.threads : [];
      setThreads(list);
      setActiveThread((prev) => list.find((item) => item.id === (keepId || prev?.id)) || list[0] || null);
    } catch { setThreads([]); }
  };

  const fetchMessages = async (teamId, threadId) => {
    try {
      const res = await api().get(`/chat/${teamId}`, { params: { thread_id: threadId } });
      setMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
      await api().post(`/chat/${teamId}/read`);
      setUnread((prev) => ({ ...prev, [teamId]: 0 }));
    } catch { setMessages([]); }
  };

  const fetchLive = async (teamId) => {
    try {
      const res = await api().get(`/chat/${teamId}/review-sessions/active`);
      setLiveSession(res.data?.session || null);
      setCanReview(Boolean(res.data?.can_review));
    } catch {
      setLiveSession(null);
      setCanReview(false);
    }
  };

  const fetchHistory = async (teamId) => {
    try {
      const res = await api().get(`/chat/${teamId}/review-sessions`);
      setHistory(Array.isArray(res.data?.sessions) ? res.data.sessions : []);
      setCanReview(Boolean(res.data?.can_review));
      setHistoryLoaded(true);
    } catch { setHistory([]); }
  };

  const peer = (targetId) => {
    const key = String(targetId);
    if (peersRef.current.has(key)) return peersRef.current.get(key);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStreamRef.current?.getTracks().forEach((track) => {
      try { pc.addTrack(track, localStreamRef.current); } catch {}
    });
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      wsRef.current?.send(JSON.stringify({ type: 'webrtc_signal', teamId: activeTeamRef.current, targetUserId: targetId, payload: { kind: 'ice', sessionId: liveSessionRef.current?.id, candidate: event.candidate } }));
    };
    pc.ontrack = (event) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      (event.streams?.[0]?.getTracks() || [event.track]).forEach((track) => {
        if (track && !remoteStreamRef.current.getTracks().some((item) => item.id === track.id)) remoteStreamRef.current.addTrack(track);
      });
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
        remoteVideoRef.current.play?.().catch(() => {});
      }
      setStatus('Live screen connected.');
    };
    peersRef.current.set(key, pc);
    return pc;
  };

  const offerViewer = async (viewerId) => {
    if (!localStreamRef.current || Number(viewerId) === Number(user.id)) return;
    const pc = peer(viewerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsRef.current?.send(JSON.stringify({ type: 'webrtc_signal', teamId: activeTeamRef.current, targetUserId: viewerId, payload: { kind: 'offer', sessionId: liveSessionRef.current?.id, sdp: pc.localDescription } }));
  };

  const handleSignal = async (data) => {
    if (!liveSessionRef.current || Number(data.teamId) !== Number(activeTeamRef.current)) return;
    if (data.payload?.sessionId && Number(data.payload.sessionId) !== Number(liveSessionRef.current.id)) return;
    const from = Number(data.fromUserId);
    if (data.payload.kind === 'offer') {
      const pc = peer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current?.send(JSON.stringify({ type: 'webrtc_signal', teamId: activeTeamRef.current, targetUserId: from, payload: { kind: 'answer', sessionId: liveSessionRef.current.id, sdp: pc.localDescription } }));
    }
    if (data.payload.kind === 'answer') {
      const pc = peersRef.current.get(String(from));
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
    }
    if (data.payload.kind === 'ice' && data.payload.candidate) {
      try { await peer(from).addIceCandidate(new RTCIceCandidate(data.payload.candidate)); } catch {}
    }
  };

  const stopSession = async (reason) => {
    const live = liveSessionRef.current;
    cleanupMedia();
    closePeers();
    if (!live || live.status !== 'active') return;
    try {
      const res = await api().post(`/chat/review-sessions/${live.id}/end`, { reason });
      setLiveSession(res.data || null);
      setStatus('Screen share ended. Waiting for review.');
    } catch {}
  };

  const startShare = async () => {
    if (!activeTeam || busy.start) return;
    setBusy((prev) => ({ ...prev, start: true }));
    setStatus('Preparing screen share...');
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const tracks = [...display.getVideoTracks(), ...display.getAudioTracks()];
      let mic = null;
      if (shareMic) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          tracks.push(...mic.getAudioTracks());
        } catch {}
      }
      const stream = new MediaStream(tracks);
      localStreamRef.current = stream;
      displayStreamRef.current = display;
      micStreamRef.current = mic;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play?.().catch(() => {});
      }
      if (display.getVideoTracks()[0]) {
        display.getVideoTracks()[0].onended = () => stopSession('Sharer stopped screen share');
      }
      const res = await api().post(`/chat/${activeTeam.id}/review-sessions`, { thread_id: activeThread?.id, note: shareNote.trim() || null });
      setLiveSession(res.data || null);
      setShareNote('');
      setTab('live');
      setStatus('Live review started.');
    } catch (error) {
      cleanupMedia();
      closePeers();
      setStatus(error.response?.data?.error || 'Unable to start screen share.');
    } finally {
      setBusy((prev) => ({ ...prev, start: false }));
    }
  };

  const joinLive = async () => {
    if (!liveSession || busy.join) return;
    setBusy((prev) => ({ ...prev, join: true }));
    try {
      const res = await api().post(`/chat/review-sessions/${liveSession.id}/join`);
      joinedSessionRef.current = liveSession.id;
      setLiveSession(res.data || null);
      setStatus('Connecting to shared screen...');
    } catch (error) {
      setStatus(error.response?.data?.error || 'Unable to join live review.');
    } finally {
      setBusy((prev) => ({ ...prev, join: false }));
    }
  };

  const leaveLive = async () => {
    const id = joinedSessionRef.current;
    joinedSessionRef.current = null;
    closePeers();
    setStatus('Left live review.');
    setLiveSession((prev) => prev ? {
      ...prev,
      participants: (prev.participants || []).map((item) =>
        Number(item.user_id) === Number(user.id) && item.role === 'viewer'
          ? { ...item, left_at: new Date().toISOString() }
          : item
      ),
    } : prev);
    if (!id) return;
    try { await api().post(`/chat/review-sessions/${id}/leave`); } catch {}
  };

  const createThread = async () => {
    if (!threadTitle.trim() || !activeTeam) return;
    try {
      const res = await api().post(`/chat/${activeTeam.id}/threads`, { title: threadTitle.trim() });
      setThreadTitle('');
      setShowThreadForm(false);
      await fetchThreads(activeTeam.id, res.data?.id);
    } catch {}
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeTeam || !activeThread) return;
    try {
      const res = await api().post(`/chat/${activeTeam.id}`, { thread_id: activeThread.id, message: text.trim(), reply_to: replyTo?.id || null });
      setMessages((prev) => [...prev, res.data]);
      setText('');
      setReplyTo(null);
      fetchThreads(activeTeam.id, activeThread.id);
    } catch {}
  };

  const saveReview = async () => {
    if (!liveSession || !decisionRemark.trim() || busy.review) return;
    setBusy((prev) => ({ ...prev, review: true }));
    try {
      const res = await api().post(`/chat/review-sessions/${liveSession.id}/decision`, { decision, remark: decisionRemark.trim() });
      setLiveSession(res.data || null);
      setDecisionRemark('');
      setStatus(`Session ${decision}.`);
      setHistoryLoaded(false);
    } catch (error) {
      setStatus(error.response?.data?.error || 'Unable to save review.');
    } finally {
      setBusy((prev) => ({ ...prev, review: false }));
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    resetRemote();
    fetchTeams();
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { joinRooms(); const interval = setInterval(() => joinRooms(), 8000); return () => clearInterval(interval); }, [teams, socketVersion]);
  useEffect(() => { activeTeamRef.current = activeTeam?.id || null; if (activeTeam) { fetchThreads(activeTeam.id); fetchLive(activeTeam.id); setHistoryLoaded(false); } }, [activeTeam]);
  useEffect(() => { activeThreadRef.current = activeThread?.id || null; if (activeTeam && activeThread) fetchMessages(activeTeam.id, activeThread.id); }, [activeTeam, activeThread]);
  useEffect(() => { liveSessionRef.current = liveSession; }, [liveSession]);
  useEffect(() => { if (tab === 'history' && activeTeam && !historyLoaded) fetchHistory(activeTeam.id); }, [tab, activeTeam, historyLoaded]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!liveSession && localStreamRef.current) { cleanupMedia(); closePeers(); }
    if (isSharer && localStreamRef.current) {
      (liveSession?.participants || []).forEach((item) => {
        if (item.role !== 'viewer') return;
        if (item.left_at) {
          const pc = peersRef.current.get(String(item.user_id));
          if (pc) {
            try { pc.close(); } catch {}
            peersRef.current.delete(String(item.user_id));
          }
          return;
        }
        offerViewer(item.user_id).catch(() => {});
      });
    }
    if (joinedSessionRef.current && liveSession?.status !== 'active') { joinedSessionRef.current = null; closePeers(); }
    if (liveSession?.status !== 'active' && Number(liveSession?.sharer_id) === Number(user.id)) { cleanupMedia(); closePeers(); }
  }, [liveSession]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ws = wsRef?.current;
    if (!ws) return;
    const onMessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'new_message') {
          const item = msg.data;
          if (Number(item.team_id) === Number(activeTeamRef.current) && Number(item.thread_id) === Number(activeThreadRef.current)) {
            setMessages((prev) => (prev.some((entry) => entry.id === item.id) ? prev : [...prev, item]));
            api().post(`/chat/${item.team_id}/read`).catch(() => {});
            setUnread((prev) => ({ ...prev, [item.team_id]: 0 }));
          } else {
            setUnread((prev) => ({ ...prev, [item.team_id]: Number(prev[item.team_id] || 0) + 1 }));
          }
          if (Number(item.team_id) === Number(activeTeamRef.current)) fetchThreads(item.team_id, activeThreadRef.current);
        }
        if (msg.event === 'thread_created' && Number(msg.data?.team_id) === Number(activeTeamRef.current)) fetchThreads(msg.data.team_id, activeThreadRef.current);
        if (msg.event === 'review_session_updated' && Number(msg.data?.team_id) === Number(activeTeamRef.current)) {
          setLiveSession(msg.data);
          setHistory((prev) => [msg.data, ...prev.filter((item) => item.id !== msg.data.id)].slice(0, 20));
        }
        if (msg.event === 'webrtc_signal') handleSignal(msg.data).catch(() => {});
      } catch {}
    };
    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [socketVersion, teams, activeTeam, activeThread, liveSession]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { leaveLive(); cleanupMedia(); closePeers(); }, []);

  const chooseTeam = async (team) => {
    if (team.id === activeTeam?.id) return;
    if (isSharer && !window.confirm('Switching teams will end the active share. Continue?')) return;
    if (isSharer) await stopSession('Sharer switched team');
    if (joinedSessionRef.current) await leaveLive();
    setActiveTeam(team);
    setMessages([]);
    setThreads([]);
    setActiveThread(null);
    setReplyTo(null);
    setStatus('');
    setTab('discussion');
  };

  const goTeams = async () => {
    if (isSharer) await stopSession('Sharer left active team view');
    if (joinedSessionRef.current) await leaveLive();
    setActiveTeam(null);
    setStatus('');
  };

  return (
    <>
      <button className={`tchat-fab ${totalUnread ? 'has-unread' : ''} ${open ? 'is-hidden' : ''}`} onClick={() => setOpen((v) => !v)} title="Team workspace">
        Notes
        {totalUnread > 0 && <span className="tchat-fab-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
      </button>
      {open && (
        <div className={`tchat-panel ${expanded ? 'tchat-panel--expanded' : ''}`}>
          <div className="tchat-header">
            <div><span className="tchat-kicker">Team Workspace</span><strong>{activeTeam ? activeTeam.name : 'Choose team'}</strong></div>
            <div className="tchat-actions"><button onClick={() => activeTeam && goTeams()}>Back</button><button onClick={() => setExpanded((v) => !v)}>{expanded ? 'Compact' : 'Expand'}</button><button onClick={() => setOpen(false)}>Close</button></div>
          </div>
          {!activeTeam ? (
            <div className="tchat-team-list">{teams.map((team) => <button key={team.id} className="tchat-team-row" onClick={() => chooseTeam(team)}><span>{initials(team.name)}</span><div><strong>{team.name}</strong><small>{team.member_count || 0} members</small></div>{unread[team.id] > 0 && <em>{unread[team.id]}</em>}</button>)}{teams.length === 0 && <p className="tchat-empty">No teams found.</p>}</div>
          ) : (
            <>
              <div className="tchat-topbar"><div className="tchat-tabs">{['discussion', 'live', 'history'].map((item) => <button key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item === 'live' ? 'Live Review' : item[0].toUpperCase() + item.slice(1)}</button>)}</div><p>No video recording is stored. Only notes, approvals, and participants are saved.</p></div>
              {tab === 'discussion' && <div className="tchat-body"><div className="tchat-thread-bar"><div className="tchat-thread-head"><div><span className="tchat-kicker">Topics</span><strong>{activeThread?.title || 'General'}</strong></div><button onClick={() => setShowThreadForm((v) => !v)}>{showThreadForm ? 'Hide' : '+ Topic'}</button></div>{showThreadForm && <div className="tchat-thread-form"><input value={threadTitle} onChange={(e) => setThreadTitle(e.target.value)} placeholder="Topic title" /><button onClick={createThread}>Create</button></div>}<div className="tchat-thread-list">{threads.map((thread) => <button key={thread.id} className={`tchat-thread-pill ${activeThread?.id === thread.id ? 'is-active' : ''}`} onClick={() => setActiveThread(thread)}>{thread.title}<small>{thread.message_count || 0}</small></button>)}</div></div><div className="tchat-messages">{messages.length === 0 && <p className="tchat-empty">No discussion yet.</p>}{messages.map((msg) => <div key={msg.id} className={`tchat-msg ${Number(msg.user_id) === Number(user.id) ? 'is-me' : ''}`}>{Number(msg.user_id) !== Number(user.id) && <span className="tchat-avatar">{initials(msg.user_name)}</span>}<div className="tchat-bubble">{Number(msg.user_id) !== Number(user.id) && <strong>{msg.user_name}</strong>}{msg.reply_to && <div className="tchat-reply-preview"><span>{msg.reply_user_name}</span><p>{msg.reply_text}</p></div>}<p>{msg.message}</p><div><time>{timeLabel(msg.created_at)}</time><button onClick={() => setReplyTo(msg)}>Reply</button></div></div></div>)}<div ref={bottomRef} /></div>{replyTo && <div className="tchat-reply-bar"><div><strong>Replying to {replyTo.user_name}</strong><p>{replyTo.message}</p></div><button onClick={() => setReplyTo(null)}>x</button></div>}<div className="tchat-input-row"><textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={`Message ${activeThread?.title || 'topic'}`} /><button onClick={sendMessage} disabled={!text.trim()}>Send</button></div></div>}
              {tab === 'live' && <div className="tchat-live"><div className="tchat-card"><span className="tchat-kicker">Current Topic</span><strong>{activeThread?.title || liveSession?.thread_title || 'General'}</strong><p>Share screen here, then approve or reject after disconnect.</p>{!liveSession && <><input value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="Short note for this review" /><label className="tchat-check"><input type="checkbox" checked={shareMic} onChange={(e) => setShareMic(e.target.checked)} /> Include microphone</label><button onClick={startShare} disabled={busy.start}>{busy.start ? 'Starting...' : 'Start Screen Share'}</button></>}{status && <small className="tchat-status">{status}</small>}</div><div className="tchat-stage">{liveSession?.status === 'active' && isSharer && <><div className="tchat-stage-head"><strong>You are sharing</strong><button onClick={() => stopSession('Sharer ended session')}>Stop</button></div><video ref={localVideoRef} autoPlay playsInline muted /></>}{liveSession?.status === 'active' && !isSharer && <><div className="tchat-stage-head"><strong>{liveSession.sharer_name} is sharing</strong>{viewerJoined ? <button onClick={leaveLive}>Leave</button> : <button onClick={joinLive} disabled={busy.join}>{busy.join ? 'Joining...' : 'Join Live'}</button>}</div>{viewerJoined ? <video ref={remoteVideoRef} autoPlay playsInline controls /> : <div className="tchat-stage-empty">Join live to see the shared screen.</div>}</>}{!liveSession && <div className="tchat-stage-empty">No live review running.</div>}{liveSession?.status === 'awaiting_review' && <div className="tchat-stage-empty">Session ended. Review is pending.</div>}{['approved', 'rejected'].includes(liveSession?.status) && <div className="tchat-stage-empty">Latest result: {human(liveSession.status)}</div>}</div><div className="tchat-side"><div className="tchat-card"><span className="tchat-kicker">Review Details</span><strong>{human(liveSession?.status || 'idle')}</strong><ul><li><span>Sharer</span><strong>{liveSession?.sharer_name || '-'}</strong></li><li><span>Started</span><strong>{dateTime(liveSession?.started_at)}</strong></li><li><span>Ended</span><strong>{dateTime(liveSession?.ended_at)}</strong></li><li><span>Remark</span><strong>{liveSession?.decision_remark || liveSession?.note || '-'}</strong></li></ul></div><div className="tchat-card"><span className="tchat-kicker">Participants</span><strong>{liveSession?.participants?.length || 0} people</strong><div className="tchat-people">{(liveSession?.participants || []).map((item) => <div key={`${item.user_id}-${item.role}`} className="tchat-person"><span>{initials(item.user_name)}</span><div><strong>{item.user_name}</strong><small>{item.role}{item.left_at ? ' left' : ' active'}</small></div></div>)}{(liveSession?.participants || []).length === 0 && <p className="tchat-empty">No participants yet.</p>}</div></div>{liveSession?.status === 'awaiting_review' && canReview && Number(liveSession?.sharer_id) !== Number(user.id) && <div className="tchat-card"><span className="tchat-kicker">Manager Review</span><div className="tchat-decision">{['approved', 'rejected'].map((item) => <button key={item} className={decision === item ? 'is-active' : ''} onClick={() => setDecision(item)}>{human(item)}</button>)}</div><textarea value={decisionRemark} onChange={(e) => setDecisionRemark(e.target.value)} placeholder="Write remark for audit trail" rows={3} /><button onClick={saveReview} disabled={!decisionRemark.trim() || busy.review}>{busy.review ? 'Saving...' : 'Save Decision'}</button></div>}</div></div>}
              {tab === 'history' && <div className="tchat-history">{history.length === 0 && <p className="tchat-empty">No review history yet.</p>}{history.map((item) => <div key={item.id} className="tchat-history-card"><div className="tchat-history-head"><div><span className="tchat-kicker">{item.thread_title || 'General'}</span><strong>{item.note || `${item.sharer_name} review`}</strong></div><em className={`tchat-pill ${item.status}`}>{human(item.status)}</em></div><p><strong>Sharer:</strong> {item.sharer_name}</p><p><strong>Reviewer:</strong> {item.decision_by_name || '-'}</p><p><strong>Started:</strong> {dateTime(item.started_at)}</p><p><strong>Ended:</strong> {dateTime(item.ended_at)}</p><p className="tchat-history-note">{item.decision_remark || item.note || 'No remark saved.'}</p><div className="tchat-history-people">{(item.participants || []).map((p) => <span key={`${item.id}-${p.user_id}-${p.role}`}>{p.user_name} - {p.role}</span>)}</div></div>)}</div>}
            </>
          )}
        </div>
      )}
    </>
  );
};

const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((item) => item[0].toUpperCase()).join('');
const timeLabel = (value) => value ? new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
const dateTime = (value) => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
const human = (value) => String(value || 'idle').split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

export default TeamChat;
