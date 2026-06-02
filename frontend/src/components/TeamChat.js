import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL, WS_BASE_URL } from '../services/runtimeConfig';
import './TeamChat.css';
/* eslint-disable react-hooks/exhaustive-deps */

const BASE = API_BASE_URL;
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

const TeamChat = ({
  wsRef,
  socketVersion = 0,
  standalone = false,
  startOpen = false,
  initialTeamId = null,
  initialThreadId = null,
  initialTab = 'discussion',
}) => {
  const user = me();
  const internalWsRef = useRef(null);
  const activeWsRef = wsRef || internalWsRef;
  const [internalSocketVersion, setInternalSocketVersion] = useState(0);
  const effectiveSocketVersion = wsRef ? socketVersion : internalSocketVersion;

  const [open, setOpen] = useState(standalone || startOpen);
  const [expanded, setExpanded] = useState(standalone);
  const [tab, setTab] = useState(initialTab);
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
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
  const [viewerMic, setViewerMic] = useState(true);
  const [decision, setDecision] = useState('approved');
  const [decisionRemark, setDecisionRemark] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState({ start: false, join: false, review: false, direct: false });
  const [memberSearch, setMemberSearch] = useState('');
  const [teamLiveMap, setTeamLiveMap] = useState({});
  const [activityFeed, setActivityFeed] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState(getBrowserNotificationPermission());

  const messagesViewportRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const activeTeamRef = useRef(null);
  const activeThreadRef = useRef(null);
  const liveSessionRef = useRef(null);
  const joinedSessionRef = useRef(null);
  const localStreamRef = useRef(null);
  const displayStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const shouldStickToBottomRef = useRef(true);
  const openRef = useRef(open);
  const teamsRef = useRef(teams);
  const notificationPermissionRef = useRef(notificationPermission);
  const teamLiveMapRef = useRef(teamLiveMap);
  const activityNoticeKeysRef = useRef(new Set());

  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + Number(b || 0), 0), [unread]);
  const hasLiveReview = useMemo(
    () => Object.values(teamLiveMap).some((session) => String(session?.status || '') === 'active'),
    [teamLiveMap]
  );
  const todayActivityFeed = useMemo(
    () => activityFeed.filter((item) => indiaDateKey(item.createdAt || item.created_at) === indiaDateKey()),
    [activityFeed]
  );
  const isSharer = liveSession?.status === 'active' && Number(liveSession?.sharer_id) === Number(user.id);
  const viewerJoined = Boolean(
    (liveSession?.participants || []).some((item) => Number(item.user_id) === Number(user.id) && item.role === 'viewer' && !item.left_at)
  ) || joinedSessionRef.current === liveSession?.id;
  const groupThreads = useMemo(
    () => threads.filter((thread) => String(thread.thread_type || 'group') !== 'direct'),
    [threads]
  );
  const directThreads = useMemo(
    () => threads.filter((thread) => String(thread.thread_type || 'group') === 'direct'),
    [threads]
  );
  const filteredMembers = useMemo(() => {
    const query = String(memberSearch || '').trim().toLowerCase();
    return teamMembers.filter((member) => {
      if (Number(member.id) === Number(user.id)) return false;
      if (!query) return true;
      return [member.name, member.email, member.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [memberSearch, teamMembers, user.id]);

  const joinRooms = (items = teams) => {
    const ws = activeWsRef.current;
    if (!ws || !items.length) return;
    const send = () => items.forEach((team) => ws.send(JSON.stringify({ type: 'join', teamId: team.id })));
    if (ws.readyState === WebSocket.OPEN) send();
    else ws.addEventListener('open', send, { once: true });
  };

  const resetRemote = () => {
    remoteStreamRef.current = new MediaStream();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.play?.().catch(() => {});
    }
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

  const connectInternalSocket = () => {
    const authToken = token();
    if (!authToken) return;

    const ws = new WebSocket(`${WS_BASE_URL}?token=${authToken}`);
    internalWsRef.current = ws;
    setInternalSocketVersion((prev) => prev + 1);

    ws.onclose = () => {
      if (token()) setTimeout(connectInternalSocket, 4000);
    };
  };

  const fetchTeams = async () => {
    try {
      const res = await api().get('/teams');
      const list = Array.isArray(res.data) ? res.data : [];
      setTeams(list);
      fetchTeamLiveStates(list);
      joinRooms(list);
      setActiveTeam((prev) => {
        if (prev && list.some((item) => Number(item.id) === Number(prev.id))) {
          return list.find((item) => Number(item.id) === Number(prev.id));
        }
        if (initialTeamId) {
          return list.find((item) => Number(item.id) === Number(initialTeamId)) || list[0] || null;
        }
        return list[0] || null;
      });
    } catch {}
  };

  const fetchTeamLiveStates = async (items = teams) => {
    if (!items.length) {
      setTeamLiveMap({});
      return;
    }

    const entries = await Promise.all(items.map(async (team) => {
      try {
        const res = await api().get(`/chat/${team.id}/review-sessions/active`);
        return [team.id, res.data?.session || null];
      } catch {
        return [team.id, null];
      }
    }));

    setTeamLiveMap(Object.fromEntries(entries));
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
      setActiveThread((prev) => list.find((item) => item.id === (keepId || prev?.id || initialThreadId)) || list[0] || null);
    } catch { setThreads([]); }
  };

  const fetchTeamMembers = async (teamId) => {
    try {
      const res = await api().get(`/teams/${teamId}/members`);
      setTeamMembers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTeamMembers([]);
    }
  };

  const markThreadRead = async (teamId, threadId) => {
    if (!teamId || !threadId) return;
    try {
      await api().post(`/chat/${teamId}/read`, { thread_id: threadId });
      setThreads((prev) => prev.map((thread) => (
        Number(thread.id) === Number(threadId) ? { ...thread, unread_count: 0 } : thread
      )));
      fetchUnread();
    } catch {}
  };

  const fetchMessages = async (teamId, threadId) => {
    try {
      const res = await api().get(`/chat/${teamId}`, { params: { thread_id: threadId } });
      setMessages(dedupeMessages(Array.isArray(res.data?.messages) ? res.data.messages : []));
      await markThreadRead(teamId, threadId);
    } catch { setMessages([]); }
  };

  const fetchLive = async (teamId) => {
    try {
      const res = await api().get(`/chat/${teamId}/review-sessions/active`);
      setLiveSession(res.data?.session || null);
      setTeamLiveMap((prev) => ({ ...prev, [teamId]: res.data?.session || null }));
      setCanReview(Boolean(res.data?.can_review));
    } catch {
      setLiveSession(null);
      setTeamLiveMap((prev) => ({ ...prev, [teamId]: null }));
      setCanReview(false);
    }
  };

  const syncNotificationPermission = () => {
    setNotificationPermission(getBrowserNotificationPermission());
  };

  const requestNotificationAccess = async () => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }

    setNotificationPermission(Notification.permission);
    if (Notification.permission === 'granted') return 'granted';

    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      return result;
    } catch {
      return Notification.permission;
    }
  };

  const addActivityItem = (item) => {
    setActivityFeed((prev) => appendActivity(prev, item));
  };

  const openActivityTarget = (item) => {
    if (typeof window !== 'undefined') window.focus?.();
    if (!standalone) setOpen(true);
    if (item?.tab) setTab(item.tab);

    if (item?.teamId) {
      const team = teamsRef.current.find((entry) => Number(entry.id) === Number(item.teamId));
      if (team) setActiveTeam(team);
    }

    if (item?.threadId) {
      setActiveThread((prev) => (Number(prev?.id) === Number(item.threadId) ? prev : { id: item.threadId }));
    }
  };

  const showBrowserNotification = (item) => {
    if (notificationPermissionRef.current !== 'granted') return;
    if (typeof document !== 'undefined' && openRef.current && document.visibilityState === 'visible') return;

    try {
      const notification = new Notification(item.title, {
        body: item.body,
        tag: item.id,
        renotify: true,
      });
      notification.onclick = () => {
        notification.close();
        openActivityTarget(item);
      };
    } catch {}
  };

  const announceActivity = (item) => {
    if (!item?.id) return;
    addActivityItem(item);
    if (activityNoticeKeysRef.current.has(item.id)) return;
    activityNoticeKeysRef.current.add(item.id);
    showBrowserNotification(item);
  };

  const buildMessageActivity = (item) => {
    const teamName = teamsRef.current.find((entry) => Number(entry.id) === Number(item.team_id))?.name || 'Team workspace';
    const directLabel = String(item.thread_type || 'group') === 'direct' ? 'Direct message' : 'Team topic';

    return {
      id: `msg:${messageKey(item)}`,
      kind: 'message',
      teamId: item.team_id,
      threadId: item.thread_id,
      tab: 'discussion',
      title: `${teamName} | ${directLabel}`,
      body: `${item.user_name || 'Teammate'}: ${truncateText(item.message, 120)}`,
      createdAt: item.created_at || new Date().toISOString(),
    };
  };

  const buildLiveActivity = (session) => {
    const teamName = teamsRef.current.find((entry) => Number(entry.id) === Number(session.team_id))?.name || 'Team workspace';

    return {
      id: `live:${session.id}:${session.status}`,
      kind: 'live',
      teamId: session.team_id,
      threadId: session.thread_id,
      tab: 'live',
      title: `${teamName} | ${session.status === 'active' ? 'Live review started' : 'Live review updated'}`,
      body:
        session.status === 'active'
          ? `${session.sharer_name || 'A teammate'} started screen share.`
          : `${session.sharer_name || 'A teammate'} updated the live review to ${human(session.status).toLowerCase()}.`,
      createdAt: session.updated_at || session.started_at || new Date().toISOString(),
    };
  };

  const updateThreadPreview = (item) => {
    if (Number(item.team_id) !== Number(activeTeamRef.current)) return;
    setThreads((prev) => prev.map((thread) => {
      if (Number(thread.id) !== Number(item.thread_id)) return thread;
      const isCurrentThread = Number(thread.id) === Number(activeThreadRef.current);
      const isOwnMessage = Number(item.user_id) === Number(user.id);
      return {
        ...thread,
        unread_count: isCurrentThread || isOwnMessage ? 0 : Number(thread.unread_count || 0) + 1,
      };
    }));
  };

  const fetchHistory = async (teamId) => {
    try {
      const res = await api().get(`/chat/${teamId}/review-sessions`);
      setHistory(Array.isArray(res.data?.sessions) ? res.data.sessions : []);
      setCanReview(Boolean(res.data?.can_review));
      setHistoryLoaded(true);
    } catch { setHistory([]); }
  };

  const prepareViewerMic = async () => {
    if (!viewerMic) return null;
    if (localStreamRef.current && !displayStreamRef.current) return localStreamRef.current;

    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = mic;
    micStreamRef.current = mic;
    return mic;
  };

  const openLiveRoom = () => {
    if (!activeTeam) return;
    const url = new URL('/live-review', window.location.origin);
    url.searchParams.set('teamId', activeTeam.id);
    if (liveSession?.id) url.searchParams.set('sessionId', liveSession.id);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
    setStatus('Opening live review in new tab...');
  };

  const openWorkspaceRoom = () => {
    const url = new URL('/team-workspace', window.location.origin);
    if (activeTeam?.id) url.searchParams.set('teamId', activeTeam.id);
    if (activeThread?.id) url.searchParams.set('threadId', activeThread.id);
    if (tab) url.searchParams.set('tab', tab);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const startDirectConversation = async (memberId) => {
    if (!activeTeam || busy.direct) return;
    setBusy((prev) => ({ ...prev, direct: true }));
    try {
      const res = await api().post(`/chat/${activeTeam.id}/direct-thread`, { target_user_id: memberId });
      await fetchThreads(activeTeam.id, res.data?.id);
      setTab('discussion');
      setStatus('Direct conversation opened.');
    } catch (error) {
      setStatus(error.response?.data?.error || 'Unable to open direct chat.');
    } finally {
      setBusy((prev) => ({ ...prev, direct: false }));
    }
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
      activeWsRef.current?.send(JSON.stringify({ type: 'webrtc_signal', teamId: activeTeamRef.current, targetUserId: targetId, payload: { kind: 'ice', sessionId: liveSessionRef.current?.id, candidate: event.candidate } }));
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
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
        remoteAudioRef.current.play?.().catch(() => {});
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
    activeWsRef.current?.send(JSON.stringify({ type: 'webrtc_signal', teamId: activeTeamRef.current, targetUserId: viewerId, payload: { kind: 'offer', sessionId: liveSessionRef.current?.id, sdp: pc.localDescription } }));
  };

  const handleSignal = async (data) => {
    if (!liveSessionRef.current || Number(data.teamId) !== Number(activeTeamRef.current)) return;
    if (data.payload?.sessionId && Number(data.payload.sessionId) !== Number(liveSessionRef.current.id)) return;
    const from = Number(data.fromUserId);
    if (data.payload.kind === 'offer') {
      if (!localStreamRef.current && viewerMic) {
        try { await prepareViewerMic(); } catch {}
      }
      const pc = peer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      activeWsRef.current?.send(JSON.stringify({ type: 'webrtc_signal', teamId: activeTeamRef.current, targetUserId: from, payload: { kind: 'answer', sessionId: liveSessionRef.current.id, sdp: pc.localDescription } }));
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
    if (!standalone) {
      openLiveRoom();
      return;
    }
    setBusy((prev) => ({ ...prev, join: true }));
    try {
      if (viewerMic) {
        try { await prepareViewerMic(); } catch {}
      }
      const res = await api().post(`/chat/review-sessions/${liveSession.id}/join`);
      joinedSessionRef.current = liveSession.id;
      setLiveSession(res.data || null);
      setStatus(viewerMic ? 'Joining with voice...' : 'Connecting to shared screen...');
    } catch (error) {
      setStatus(error.response?.data?.error || 'Unable to join live review.');
    } finally {
      setBusy((prev) => ({ ...prev, join: false }));
    }
  };

  const leaveLive = async () => {
    const id = joinedSessionRef.current;
    joinedSessionRef.current = null;
    cleanupMedia();
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
    const payload = text.trim();
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      id: tempId,
      client_temp_id: tempId,
      team_id: activeTeam.id,
      thread_id: activeThread.id,
      message: payload,
      created_at: new Date().toISOString(),
      reply_to: replyTo?.id || null,
      reply_text: replyTo?.message || null,
      reply_user_name: replyTo?.user_name || null,
      thread_type: activeThread.thread_type || 'group',
      user_id: user.id,
      user_name: user.name || user.email || 'You',
      optimistic: true,
      pending: true,
    };

    shouldStickToBottomRef.current = true;
    setMessages((prev) => upsertMessage(prev, optimisticMessage));
    setText('');
    setReplyTo(null);

    if (activeWsRef.current?.readyState === WebSocket.OPEN) {
      activeWsRef.current.send(JSON.stringify({
        type: 'chat_preview',
        teamId: activeTeam.id,
        threadId: activeThread.id,
        threadType: activeThread.thread_type || 'group',
        targetUserId: activeThread.direct_partner_id || null,
        clientTempId: tempId,
        message: payload,
        reply_to: replyTo?.id || null,
        reply_text: replyTo?.message || null,
        reply_user_name: replyTo?.user_name || null,
        userName: user.name || user.email || 'You',
      }));
    }

    try {
      const res = await api().post(`/chat/${activeTeam.id}`, {
        thread_id: activeThread.id,
        message: payload,
        reply_to: replyTo?.id || null,
        client_temp_id: tempId,
      });
      setMessages((prev) => upsertMessage(prev, { ...res.data, optimistic: false, pending: false }));
      fetchThreads(activeTeam.id, activeThread.id);
    } catch {
      setMessages((prev) => markMessageFailed(prev, tempId));
    }
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
    if (!wsRef) connectInternalSocket();
    const interval = setInterval(fetchUnread, 15000);
    return () => {
      clearInterval(interval);
      if (!wsRef) {
        try { internalWsRef.current?.close(); } catch {}
      }
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { joinRooms(); const interval = setInterval(() => joinRooms(), 8000); return () => clearInterval(interval); }, [teams, effectiveSocketVersion]);
  useEffect(() => {
    activeTeamRef.current = activeTeam?.id || null;
    if (activeTeam) {
      fetchTeamMembers(activeTeam.id);
      fetchThreads(activeTeam.id);
      fetchLive(activeTeam.id);
      setHistoryLoaded(false);
    }
  }, [activeTeam]);
  useEffect(() => { activeThreadRef.current = activeThread?.id || null; if (activeTeam && activeThread) fetchMessages(activeTeam.id, activeThread.id); }, [activeTeam, activeThread]);
  useEffect(() => { liveSessionRef.current = liveSession; }, [liveSession]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { notificationPermissionRef.current = notificationPermission; }, [notificationPermission]);
  useEffect(() => { teamLiveMapRef.current = teamLiveMap; }, [teamLiveMap]);
  useEffect(() => { if (tab === 'history' && activeTeam && !historyLoaded) fetchHistory(activeTeam.id); }, [tab, activeTeam, historyLoaded]);
  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !shouldStickToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);
  useEffect(() => { shouldStickToBottomRef.current = true; }, [activeTeam?.id, activeThread?.id]);
  useEffect(() => {
    syncNotificationPermission();
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('visibilitychange', syncNotificationPermission);
    window.addEventListener('focus', syncNotificationPermission);
    return () => {
      document.removeEventListener('visibilitychange', syncNotificationPermission);
      window.removeEventListener('focus', syncNotificationPermission);
    };
  }, []);
  useEffect(() => {
    if (!open || standalone || notificationPermission === 'granted' || notificationPermission === 'unsupported') return;
    requestNotificationAccess().catch(() => {});
  }, [open, standalone, notificationPermission]);

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
    const ws = activeWsRef.current;
    if (!ws) return;
    const onMessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'chat_preview') {
          const item = msg.data;
          if (Number(item.team_id) === Number(activeTeamRef.current) && Number(item.thread_id) === Number(activeThreadRef.current)) {
            setMessages((prev) => upsertMessage(prev, item));
          }
          if (Number(item.user_id) !== Number(user.id)) announceActivity(buildMessageActivity(item));
        }
        if (msg.event === 'new_message') {
          const item = msg.data;
          fetchUnread();
          updateThreadPreview(item);
          if (Number(item.team_id) === Number(activeTeamRef.current) && Number(item.thread_id) === Number(activeThreadRef.current)) {
            setMessages((prev) => upsertMessage(prev, { ...item, optimistic: false, pending: false, failed: false }));
            api().post(`/chat/${item.team_id}/read`, { thread_id: item.thread_id }).catch(() => {});
          } else {
            setUnread((prev) => ({ ...prev, [item.team_id]: Number(prev[item.team_id] || 0) + 1 }));
          }
          if (Number(item.user_id) !== Number(user.id)) announceActivity(buildMessageActivity(item));
          if (Number(item.team_id) === Number(activeTeamRef.current)) fetchThreads(item.team_id, activeThreadRef.current);
        }
        if (msg.event === 'thread_created' && Number(msg.data?.team_id) === Number(activeTeamRef.current)) fetchThreads(msg.data.team_id, activeThreadRef.current);
        if (msg.event === 'review_session_updated') {
          const item = msg.data;
          const previousStatus = teamLiveMapRef.current[item.team_id]?.status || null;
          setTeamLiveMap((prev) => ({ ...prev, [item.team_id]: item.status === 'active' ? item : null }));
          if (Number(item.team_id) === Number(activeTeamRef.current)) {
            setLiveSession(item);
            setHistory((prev) => [item, ...prev.filter((entry) => entry.id !== item.id)].slice(0, 20));
          }
          if (Number(item.sharer_id) !== Number(user.id) && previousStatus !== item.status) {
            announceActivity(buildLiveActivity(item));
          }
        }
        if (msg.event === 'webrtc_signal') handleSignal(msg.data).catch(() => {});
      } catch {}
    };
    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [effectiveSocketVersion, teams, activeTeam, activeThread, liveSession, viewerMic]);

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
    setTab(initialTab || 'discussion');
  };

  const goTeams = async () => {
    if (isSharer) await stopSession('Sharer left active team view');
    if (joinedSessionRef.current) await leaveLive();
    setActiveTeam(null);
    setStatus('');
  };

  const activeThreadLabel = activeThread?.direct_partner_name || activeThread?.display_title || activeThread?.title || 'General';
  const activeThreadType = String(activeThread?.thread_type || 'group') === 'direct' ? 'Direct conversation' : 'Team discussion';
  const activeMemberCount = teamMembers.length || activeTeam?.member_count || 0;
  const activeParticipants = (liveSession?.participants || []).filter((item) => !item.left_at);
  const notificationPromptCopy = notificationPermission === 'denied'
    ? 'Chrome notifications are blocked. Allow this site from browser settings, then tap Enable Notifications again.'
    : 'Allow browser notifications so new messages and live screen-share alerts reach you even when Notes is closed.';
  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 72;
  };
  const notificationFeedCard = (
    <div className="tchat-card tchat-card--hero">
      <div className="tchat-card-head">
        <div>
          <span className="tchat-kicker">Today</span>
          <strong>Notifications</strong>
        </div>
        <span className="tchat-meta-pill">{todayActivityFeed.length}</span>
      </div>
      {todayActivityFeed.length === 0 && <p className="tchat-empty">No alerts today.</p>}
      {todayActivityFeed.length > 0 && (
        <div className="tchat-alert-list">
          {todayActivityFeed.slice(0, 8).map((item) => (
            <button key={item.id} type="button" className="tchat-alert-row" onClick={() => openActivityTarget(item)}>
              <div className="tchat-alert-copy">
                <strong>{item.title}</strong>
                <small>{item.body}</small>
              </div>
              <div className="tchat-alert-meta">
                <span className={`tchat-alert-kind tchat-alert-kind--${item.kind}`}>{item.kind === 'live' ? 'Live' : 'New'}</span>
                <time>{activityTimeLabel(item.createdAt)}</time>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const panel = (
    <div className={`tchat-panel ${expanded ? 'tchat-panel--expanded' : ''} ${standalone ? 'tchat-panel--standalone' : ''}`}>
      <div className="tchat-panel-glow tchat-panel-glow--one" />
      <div className="tchat-panel-glow tchat-panel-glow--two" />
      <div className="tchat-header">
        <div className="tchat-header-main">
          <div className="tchat-brand">
            <span className="tchat-brand-mark">{activeTeam ? initials(activeTeam.name).slice(0, 1) : 'T'}</span>
            <div>
              <span className="tchat-kicker">Team Workspace</span>
              <strong>{activeTeam ? activeTeam.name : 'Choose team'}</strong>
            </div>
          </div>
          {activeTeam && (
            <div className="tchat-header-stats">
              <span><strong>{activeMemberCount}</strong> members</span>
              <span><strong>{threads.length}</strong> threads</span>
            </div>
          )}
        </div>
        <div className="tchat-actions">
          {activeTeam && <button onClick={() => activeTeam && goTeams()}>Back</button>}
          {!standalone && activeTeam && <button onClick={openWorkspaceRoom}>Open Chat In New Tab</button>}
          {!standalone && <button onClick={() => setExpanded((v) => !v)}>{expanded ? 'Compact' : 'Full Screen'}</button>}
          {!standalone && <button onClick={() => setOpen(false)}>Close</button>}
        </div>
      </div>

      {!activeTeam ? (
        <div className="tchat-team-picker">
          <div className="tchat-card tchat-card--hero tchat-team-hero">
            <span className="tchat-kicker">Workspace Directory</span>
            <strong>Pick a team and continue the conversation in one focused place.</strong>
            <p>Topics, direct messages, live reviews, and approvals stay together in the same workflow.</p>
            <div className="tchat-stat-grid">
              <div className="tchat-stat">
                <span>Teams</span>
                <strong>{teams.length}</strong>
              </div>
              <div className="tchat-stat">
                <span>Unread</span>
                <strong>{totalUnread}</strong>
              </div>
              <div className="tchat-stat">
                <span>Mode</span>
                <strong>{standalone ? 'Studio' : 'Popup'}</strong>
              </div>
            </div>
          </div>

          {!standalone && notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <div className="tchat-banner tchat-banner--action">
              <div>
                <strong>Turn on browser notifications</strong>
                <p>{notificationPromptCopy}</p>
              </div>
              <button type="button" onClick={requestNotificationAccess}>Enable Notifications</button>
            </div>
          )}

          <div className="tchat-team-list">
            {teams.map((team) => (
              <button key={team.id} className="tchat-team-row" onClick={() => chooseTeam(team)}>
                <span>{initials(team.name)}</span>
                <div className="tchat-team-copy">
                  <strong>{team.name}</strong>
                  <small>{team.member_count || 0} members</small>
                </div>
                <div className="tchat-team-row-meta">
                  <small>{Number(unread[team.id] || 0) > 0 ? unreadLabel(unread[team.id]) : 'Open team'}</small>
                  {String(teamLiveMap[team.id]?.status || '') === 'active' && <span className="tchat-live-chip">Live</span>}
                  {unread[team.id] > 0 && <em>{unread[team.id]}</em>}
                </div>
              </button>
            ))}
            {teams.length === 0 && <p className="tchat-empty">No teams found.</p>}
          </div>

          {notificationFeedCard}
        </div>
      ) : (
        <>
          <div className="tchat-topbar">
            <div className="tchat-tabs">
              {['discussion', 'live', 'history'].map((item) => (
                <button key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>
                  <span className="tchat-tab-label">{item === 'live' ? 'Live Review' : item[0].toUpperCase() + item.slice(1)}</span>
                </button>
              ))}
            </div>
            <p className="tchat-note-pill">No recording stored. Notes, approvals, and participants only.</p>
          </div>

          {status && <div className="tchat-banner">{status}</div>}
          {!standalone && notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <div className="tchat-banner tchat-banner--action">
              <div>
                <strong>Turn on browser notifications</strong>
                <p>{notificationPromptCopy}</p>
              </div>
              <button type="button" onClick={requestNotificationAccess}>Enable Notifications</button>
            </div>
          )}

          {tab === 'discussion' && (
            <div className="tchat-discussion-shell">
              <div className="tchat-dashboard">
                <aside className="tchat-sidebar-shell">
                  <div className="tchat-rail">
                    <div className="tchat-rail-logo">{initials(activeTeam.name).slice(0, 1)}</div>
                    <button type="button" className={`tchat-rail-action ${tab === 'discussion' ? 'is-active' : ''}`} onClick={() => setTab('discussion')} title="Discussion">D</button>
                    <button type="button" className={`tchat-rail-action ${tab === 'live' ? 'is-active' : ''}`} onClick={() => setTab('live')} title="Live review">L</button>
                    <button type="button" className={`tchat-rail-action ${tab === 'history' ? 'is-active' : ''}`} onClick={() => setTab('history')} title="History">H</button>
                    <div className="tchat-rail-spacer" />
                    <div className="tchat-rail-user">{initials(user.name || user.email || 'You')}</div>
                  </div>

                  <div className="tchat-thread-bar">
                    <div className="tchat-thread-head">
                      <div>
                        <span className="tchat-kicker">Topics</span>
                        <strong>{activeThreadLabel}</strong>
                      </div>
                      <button onClick={() => setShowThreadForm((v) => !v)}>{showThreadForm ? 'Hide' : '+ Topic'}</button>
                    </div>

                    {showThreadForm && (
                      <div className="tchat-thread-form">
                        <input value={threadTitle} onChange={(e) => setThreadTitle(e.target.value)} placeholder="Topic title" />
                        <button onClick={createThread}>Create</button>
                      </div>
                    )}

                    <div className="tchat-thread-section">
                      <div className="tchat-thread-subtitle">Team Topics</div>
                      <div className="tchat-thread-list">
                        {groupThreads.map((thread) => (
                          <button
                            key={thread.id}
                            className={`tchat-thread-row ${activeThread?.id === thread.id ? 'is-active' : ''}`}
                            onClick={() => setActiveThread(thread)}
                          >
                            <span className="tchat-thread-avatar">{initials(thread.display_title || thread.title)}</span>
                            <div className="tchat-thread-copy">
                              <strong>{thread.display_title || thread.title}</strong>
                              <small>{thread.message_count || 0} messages</small>
                            </div>
                            <div className="tchat-thread-meta">
                              <small>{Number(thread.unread_count || 0) > 0 ? unreadLabel(thread.unread_count) : 'Open'}</small>
                              {Number(thread.unread_count || 0) > 0 && <span className="tchat-unread-badge">{thread.unread_count}</span>}
                            </div>
                          </button>
                        ))}
                        {groupThreads.length === 0 && <p className="tchat-empty tchat-thread-empty">No topics yet.</p>}
                      </div>
                    </div>

                    {directThreads.length > 0 && (
                      <div className="tchat-thread-section">
                        <div className="tchat-thread-subtitle">Direct Messages</div>
                        <div className="tchat-thread-list">
                          {directThreads.map((thread) => (
                            <button
                              key={thread.id}
                              className={`tchat-thread-row tchat-thread-row--direct ${activeThread?.id === thread.id ? 'is-active' : ''}`}
                              onClick={() => setActiveThread(thread)}
                            >
                              <span className="tchat-thread-avatar">{initials(thread.direct_partner_name || thread.display_title || thread.title)}</span>
                              <div className="tchat-thread-copy">
                                <strong>{thread.direct_partner_name || thread.display_title || thread.title}</strong>
                                <small>Direct conversation</small>
                              </div>
                              <div className="tchat-thread-meta">
                                <small>{Number(thread.unread_count || 0) > 0 ? unreadLabel(thread.unread_count) : 'Open'}</small>
                                {Number(thread.unread_count || 0) > 0 && <span className="tchat-unread-badge">{thread.unread_count}</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>

                <section className="tchat-conversation">
                  <div className="tchat-conversation-head">
                    <div className="tchat-conversation-user">
                      <span className="tchat-avatar tchat-avatar--hero">{initials(activeThreadLabel)}</span>
                      <div>
                        <strong>{activeThreadLabel}</strong>
                        <small>{activeThreadType} | {messages.length} messages</small>
                      </div>
                    </div>
                    <div className="tchat-conversation-badges">
                      <span className="tchat-meta-pill">{activeMemberCount} members</span>
                      {liveSession?.status === 'active' && <span className="tchat-meta-pill tchat-meta-pill--live">Live review running</span>}
                    </div>
                  </div>

                  <div className="tchat-messages" ref={messagesViewportRef} onScroll={handleMessagesScroll}>
                    {messages.length === 0 && <p className="tchat-empty">No discussion yet.</p>}
                    {messages.map((msg) => (
                      <div key={msg.id} className={`tchat-msg ${Number(msg.user_id) === Number(user.id) ? 'is-me' : ''}`}>
                        {Number(msg.user_id) !== Number(user.id) && <span className="tchat-avatar">{initials(msg.user_name)}</span>}
                        <div className="tchat-bubble">
                          {Number(msg.user_id) !== Number(user.id) && <strong>{msg.user_name}</strong>}
                          {msg.reply_to && (
                            <div className="tchat-reply-preview">
                              <span>{msg.reply_user_name}</span>
                              <p>{msg.reply_text}</p>
                            </div>
                          )}
                          <p>{msg.message}</p>
                          <div className="tchat-message-meta">
                            <time>{msg.failed ? 'Failed' : msg.pending ? 'Sending...' : timeLabel(msg.created_at)}</time>
                            <button type="button" className="tchat-link-button" onClick={() => setReplyTo(msg)}>Reply</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {replyTo && (
                    <div className="tchat-reply-bar">
                      <div>
                        <strong>Replying to {replyTo.user_name}</strong>
                        <p>{replyTo.message}</p>
                      </div>
                      <button onClick={() => setReplyTo(null)}>Cancel</button>
                    </div>
                  )}

                  <div className="tchat-input-row">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder={`Message ${activeThreadLabel.toLowerCase()}`}
                    />
                    <button onClick={sendMessage} disabled={!text.trim()}>Send</button>
                  </div>
                  <p className="tchat-input-hint">Press Enter to send and Shift + Enter for a new line.</p>
                </section>

                <aside className="tchat-insights">
                  <div className="tchat-card tchat-card--hero">
                    <span className="tchat-kicker">Workspace Snapshot</span>
                    <strong>{activeTeam.name}</strong>
                    <p>Keep discussions focused, jump into live review when needed, and leave an approval trail without leaving the workspace.</p>
                    <div className="tchat-stat-grid">
                      <div className="tchat-stat">
                        <span>Messages</span>
                        <strong>{messages.length}</strong>
                      </div>
                      <div className="tchat-stat">
                        <span>Topics</span>
                        <strong>{groupThreads.length}</strong>
                      </div>
                      <div className="tchat-stat">
                        <span>DMs</span>
                        <strong>{directThreads.length}</strong>
                      </div>
                    </div>
                  </div>

                  <div className={`tchat-card ${liveSession?.status === 'active' ? 'tchat-card--accent' : ''}`}>
                    <div className="tchat-card-head">
                      <div>
                        <span className="tchat-kicker">Live Snapshot</span>
                        <strong>{liveSession ? human(liveSession.status) : 'Review Ready'}</strong>
                      </div>
                      <button onClick={() => setTab('live')}>Open</button>
                    </div>
                    <p>
                      {liveSession
                        ? `${liveSession.sharer_name || 'A teammate'} is handling ${human(liveSession.status).toLowerCase()} for this team.`
                        : 'Use live review when you need screen share feedback from a manager or teammate.'}
                    </p>
                    <div className="tchat-stat-grid">
                      <div className="tchat-stat">
                        <span>Participants</span>
                        <strong>{activeParticipants.length}</strong>
                      </div>
                      <div className="tchat-stat">
                        <span>Can Review</span>
                        <strong>{canReview ? 'Yes' : 'No'}</strong>
                      </div>
                    </div>
                  </div>

                  {notificationFeedCard}
                </aside>
              </div>

              <div className="tchat-card tchat-member-card tchat-member-card--footer">
                <span className="tchat-kicker">Team People</span>
                <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search teammate" />
                {filteredMembers.length === 0 && <p className="tchat-empty">No teammate found.</p>}
                <div className="tchat-member-list">
                  {filteredMembers.map((member) => (
                    <button key={member.id} className="tchat-member-row" onClick={() => startDirectConversation(member.id)} disabled={busy.direct}>
                      <span className="tchat-member-avatar">{initials(member.name)}</span>
                      <div>
                        <strong>{member.name}</strong>
                        <small>{member.role} | {member.current_tasks || 0} tasks</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'live' && (
            <div className="tchat-live">
              <div className="tchat-live-main">
                <div className="tchat-card">
                  <span className="tchat-kicker">Current Topic</span>
                  <strong>{activeThreadLabel || liveSession?.thread_title || 'General'}</strong>
                  <p>Start a focused screen share here, then leave a clear decision after the walkthrough ends.</p>

                  {!liveSession && (
                    <>
                      <input value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="Short note for this review" />
                      <label className="tchat-check">
                        <input type="checkbox" checked={shareMic} onChange={(e) => setShareMic(e.target.checked)} />
                        Include microphone while sharing
                      </label>
                      <button onClick={startShare} disabled={busy.start}>{busy.start ? 'Starting...' : 'Start Screen Share'}</button>
                    </>
                  )}

                  {liveSession?.status === 'active' && !isSharer && (
                    <label className="tchat-check">
                      <input type="checkbox" checked={viewerMic} onChange={(e) => setViewerMic(e.target.checked)} />
                      Enable my microphone while joining
                    </label>
                  )}

                  {status && <small className="tchat-status">{status}</small>}
                </div>

                <div className="tchat-stage">
                  {liveSession?.status === 'active' && isSharer && (
                    <>
                      <div className="tchat-stage-head">
                        <strong>You are sharing</strong>
                        <button onClick={() => stopSession('Sharer ended session')}>Stop</button>
                      </div>
                      <video ref={localVideoRef} autoPlay playsInline muted />
                    </>
                  )}

                  {liveSession?.status === 'active' && !isSharer && (
                    <>
                      <div className="tchat-stage-head">
                        <strong>{liveSession.sharer_name} is sharing</strong>
                        {standalone ? (
                          viewerJoined ? (
                            <button onClick={leaveLive}>Leave</button>
                          ) : (
                            <button onClick={joinLive} disabled={busy.join}>{busy.join ? 'Joining...' : 'Join Live'}</button>
                          )
                        ) : (
                          <button onClick={openLiveRoom}>Open in Tab</button>
                        )}
                      </div>
                      {viewerJoined ? (
                        <video ref={remoteVideoRef} autoPlay playsInline controls />
                      ) : (
                        <div className="tchat-stage-empty">Open the live room in a new tab to join the shared screen with voice.</div>
                      )}
                    </>
                  )}

                  {!liveSession && <div className="tchat-stage-empty">No live review running.</div>}
                  {liveSession?.status === 'awaiting_review' && <div className="tchat-stage-empty">Session ended. Review is pending.</div>}
                  {['approved', 'rejected'].includes(liveSession?.status) && <div className="tchat-stage-empty">Latest result: {human(liveSession.status)}</div>}
                </div>
              </div>

              <div className="tchat-side">
                <div className="tchat-card tchat-card--hero">
                  <span className="tchat-kicker">Session Status</span>
                  <strong>{human(liveSession?.status || 'idle')}</strong>
                  <p>{liveSession ? `Sharer: ${liveSession.sharer_name || '-'}` : 'Start a live walkthrough to get faster review decisions.'}</p>
                  <div className="tchat-stat-grid">
                    <div className="tchat-stat">
                      <span>Started</span>
                      <strong>{liveSession?.started_at ? timeLabel(liveSession.started_at) : '-'}</strong>
                    </div>
                    <div className="tchat-stat">
                      <span>Active</span>
                      <strong>{activeParticipants.length}</strong>
                    </div>
                  </div>
                </div>

                <div className="tchat-card">
                  <span className="tchat-kicker">Review Details</span>
                  <strong>{human(liveSession?.status || 'idle')}</strong>
                  <ul>
                    <li><span>Sharer</span><strong>{liveSession?.sharer_name || '-'}</strong></li>
                    <li><span>Started</span><strong>{dateTime(liveSession?.started_at)}</strong></li>
                    <li><span>Ended</span><strong>{dateTime(liveSession?.ended_at)}</strong></li>
                    <li><span>Remark</span><strong>{liveSession?.decision_remark || liveSession?.note || '-'}</strong></li>
                  </ul>
                  {liveSession?.status === 'active' && !standalone && !isSharer && <button onClick={openLiveRoom}>Open Dedicated Live Room</button>}
                </div>

                <div className="tchat-card">
                  <span className="tchat-kicker">Participants ({liveSession?.participants?.length || 0})</span>
                  <strong>Live Viewers</strong>
                  <div className="tchat-people">
                    {(liveSession?.participants || []).map((item) => (
                      <div key={`${item.user_id}-${item.role}`} className="tchat-person">
                        <span>{initials(item.user_name)}</span>
                        <div>
                          <strong>{item.user_name}</strong>
                          <small>{item.role}{item.left_at ? ' (left)' : ' (active)'}</small>
                        </div>
                      </div>
                    ))}
                    {(liveSession?.participants || []).length === 0 && <p className="tchat-empty">No participants yet.</p>}
                  </div>
                </div>

                {liveSession?.status === 'awaiting_review' && canReview && Number(liveSession?.sharer_id) !== Number(user.id) && (
                  <div className="tchat-card">
                    <span className="tchat-kicker">Manager Review</span>
                    <div className="tchat-decision">
                      {['approved', 'rejected'].map((item) => (
                        <button key={item} className={decision === item ? 'is-active' : ''} onClick={() => setDecision(item)}>
                          {human(item)}
                        </button>
                      ))}
                    </div>
                    <textarea value={decisionRemark} onChange={(e) => setDecisionRemark(e.target.value)} placeholder="Write remark for audit trail" rows={3} />
                    <button onClick={saveReview} disabled={!decisionRemark.trim() || busy.review}>{busy.review ? 'Saving...' : 'Save Decision'}</button>
                  </div>
                )}

                <audio ref={remoteAudioRef} autoPlay playsInline />
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="tchat-history">
              {history.length === 0 && <p className="tchat-empty">No review history yet.</p>}
              {history.map((item) => (
                <div key={item.id} className="tchat-history-card">
                  <div className="tchat-history-head">
                    <div>
                      <span className="tchat-kicker">{item.thread_title || 'General'}</span>
                      <strong>{item.note || `${item.sharer_name} review`}</strong>
                    </div>
                    <em className={`tchat-pill ${item.status}`}>{human(item.status)}</em>
                  </div>
                  <div className="tchat-history-meta">
                    <p><strong>Sharer:</strong> {item.sharer_name}</p>
                    <p><strong>Reviewer:</strong> {item.decision_by_name || '-'}</p>
                    <p><strong>Started:</strong> {dateTime(item.started_at)}</p>
                    <p><strong>Ended:</strong> {dateTime(item.ended_at)}</p>
                  </div>
                  <p className="tchat-history-note">{item.decision_remark || item.note || 'No remark saved.'}</p>
                  <div className="tchat-history-people">
                    {(item.participants || []).map((p) => (
                      <span key={`${item.id}-${p.user_id}-${p.role}`}>{p.user_name} - {p.role}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  if (standalone) return panel;

  return (
    <>
      <button
        className={`tchat-fab ${totalUnread ? 'has-unread' : ''} ${hasLiveReview ? 'has-live' : ''} ${open ? 'is-hidden' : ''}`}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) requestNotificationAccess().catch(() => {});
        }}
        title="Team workspace"
      >
        <span className="tchat-fab-label">Notes</span>
        {hasLiveReview && <span className="tchat-fab-live">Live</span>}
        {totalUnread > 0 && <span className="tchat-fab-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
      </button>
      {open && panel}
    </>
  );
};

const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((item) => item[0].toUpperCase()).join('');
const messageKey = (item) => item?.client_temp_id || (item?.id ? `id:${item.id}` : `${item?.user_id || 'u'}:${item?.created_at || 't'}:${item?.message || ''}`);
const dedupeMessages = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = messageKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const upsertMessage = (items = [], item) => {
  const next = [];
  let replaced = false;

  items.forEach((entry) => {
    const sameClientTempId = item?.client_temp_id && entry?.client_temp_id && String(entry.client_temp_id) === String(item.client_temp_id);
    const sameId = item?.id && entry?.id && String(entry.id) === String(item.id);

    if (sameClientTempId || sameId) {
      next.push({ ...entry, ...item });
      replaced = true;
      return;
    }

    next.push(entry);
  });

  if (!replaced) next.push(item);
  return dedupeMessages(next);
};

const markMessageFailed = (items = [], clientTempId) => items.map((entry) => (
  String(entry?.client_temp_id || '') === String(clientTempId)
    ? { ...entry, pending: false, failed: true }
    : entry
));
const appendActivity = (items = [], item) => {
  const next = [{ ...item, createdAt: item.createdAt || new Date().toISOString() }, ...items.filter((entry) => entry.id !== item.id)];
  return next
    .filter((entry) => indiaDateKey(entry.createdAt) === indiaDateKey())
    .slice(0, 24);
};
const getBrowserNotificationPermission = () => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
};
const parseIndiaWallClock = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?)?/
  );

  if (match) {
    const [, year, month, day, hour = '0', minute = '0', second = '0', ms = '0'] = match;
    return new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(ms.padEnd(3, '0'))
    ));
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const formatIndiaTime = (value, options) => {
  const date = parseIndiaWallClock(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...options }).format(date);
};

const timeLabel = (value) => formatIndiaTime(value, { hour: 'numeric', minute: '2-digit', hour12: true });
const dateTime = (value) => formatIndiaTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) || '-';
const indiaDateKey = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(value));
const activityTimeLabel = (value) => {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
};
const unreadLabel = (count) => {
  const total = Number(count || 0);
  return total > 0 ? `${total} new` : 'Open';
};
const truncateText = (value, limit = 120) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1)}...`;
};
const human = (value) => String(value || 'idle').split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

export default TeamChat;
