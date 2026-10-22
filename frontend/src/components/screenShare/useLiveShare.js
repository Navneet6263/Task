import { useCallback, useEffect, useRef, useState } from 'react';
import { chat } from '../../services/api';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const errorOf = (error, fallback) => error?.response?.data?.error || error?.message || fallback;

// Live screen sharing for one team over WebRTC. The sharer sends an offer to each viewer;
// signalling goes through the shared workspace socket. Nothing is recorded.
export default function useLiveShare({ wsRef, socketVersion, teamId, selfId }) {
  const [session, setSession] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [remoteLive, setRemoteLive] = useState(false);
  const localVideoRef = useRef(null), remoteVideoRef = useRef(null), remoteAudioRef = useRef(null);
  const localStream = useRef(null), displayStream = useRef(null), micStream = useRef(null), remoteStream = useRef(null);
  const peers = useRef(new Map()), sessionRef = useRef(null), teamRef = useRef(teamId), joinedRef = useRef(null), viewerMic = useRef(true);
  sessionRef.current = session; teamRef.current = teamId;

  const send = (payload) => { const ws = wsRef?.current; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); };
  const resetRemote = () => {
    remoteStream.current = typeof MediaStream === 'undefined' ? null : new MediaStream(); setRemoteLive(false);
    [remoteVideoRef.current, remoteAudioRef.current].forEach((el) => { if (el) { el.srcObject = remoteStream.current; el.play?.().catch(() => {}); } });
  };
  const cleanupMedia = () => {
    [localStream.current, displayStream.current, micStream.current].forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    localStream.current = null; displayStream.current = null; micStream.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };
  const closePeers = () => { peers.current.forEach((pc) => { try { pc.close(); } catch { /* already closed */ } }); peers.current.clear(); resetRemote(); };

  const peer = (targetId) => {
    const key = String(targetId);
    if (peers.current.has(key)) return peers.current.get(key);
    const pc = new RTCPeerConnection(ICE);
    localStream.current?.getTracks().forEach((track) => { try { pc.addTrack(track, localStream.current); } catch { /* duplicate */ } });
    pc.onicecandidate = (event) => { if (event.candidate) send({ type: 'webrtc_signal', teamId: teamRef.current, targetUserId: targetId, payload: { kind: 'ice', sessionId: sessionRef.current?.id, candidate: event.candidate } }); };
    pc.ontrack = (event) => {
      if (!remoteStream.current) remoteStream.current = new MediaStream();
      (event.streams?.[0]?.getTracks() || [event.track]).forEach((track) => { if (track && !remoteStream.current.getTracks().some((t) => t.id === track.id)) remoteStream.current.addTrack(track); });
      [remoteVideoRef.current, remoteAudioRef.current].forEach((el) => { if (el) { el.srcObject = remoteStream.current; el.play?.().catch(() => {}); } });
      setRemoteLive(true); setStatus('Connected');
    };
    peers.current.set(key, pc);
    return pc;
  };

  const offerViewer = async (viewerId) => {
    if (!localStream.current || Number(viewerId) === Number(selfId)) return;
    const pc = peer(viewerId);
    await pc.setLocalDescription(await pc.createOffer());
    send({ type: 'webrtc_signal', teamId: teamRef.current, targetUserId: viewerId, payload: { kind: 'offer', sessionId: sessionRef.current?.id, sdp: pc.localDescription } });
  };

  const prepareViewerMic = async () => {
    if (!viewerMic.current || localStream.current) return;
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.current = mic; micStream.current = mic;
  };

  const handleSignal = async (data) => {
    if (!sessionRef.current || Number(data.teamId) !== Number(teamRef.current)) return;
    if (data.payload?.sessionId && Number(data.payload.sessionId) !== Number(sessionRef.current.id)) return;
    const from = Number(data.fromUserId);
    if (data.payload.kind === 'offer') {
      try { await prepareViewerMic(); } catch { /* listen only */ }
      const pc = peer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
      await pc.setLocalDescription(await pc.createAnswer());
      send({ type: 'webrtc_signal', teamId: teamRef.current, targetUserId: from, payload: { kind: 'answer', sessionId: sessionRef.current.id, sdp: pc.localDescription } });
    }
    if (data.payload.kind === 'answer') { const pc = peers.current.get(String(from)); if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.payload.sdp)); }
    if (data.payload.kind === 'ice' && data.payload.candidate) { try { await peer(from).addIceCandidate(new RTCIceCandidate(data.payload.candidate)); } catch { /* late candidate */ } }
  };

  const load = useCallback(async () => {
    if (!teamId) { setSession(null); return; }
    try { const r = await chat.activeSession(teamId); setSession(r.data?.session || null); setCanReview(Boolean(r.data?.can_review)); }
    catch { setSession(null); setCanReview(false); }
  }, [teamId]);
  useEffect(() => { load(); }, [load]);

  // Socket: session changes for this team and WebRTC signalling.
  useEffect(() => {
    const ws = wsRef?.current;
    if (!ws) return undefined;
    const onMessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'review_session_updated' && Number(msg.data?.team_id) === Number(teamRef.current)) setSession(msg.data);
        if (msg.event === 'webrtc_signal') handleSignal(msg.data).catch(() => {});
      } catch { /* ignore */ }
    };
    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [wsRef, socketVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSharer = session?.status === 'active' && Number(session?.sharer_id) === Number(selfId);
  // Sharer offers to every viewer who joins and drops those who leave; everyone cleans up when it ends.
  useEffect(() => {
    if (!session && localStream.current) { cleanupMedia(); closePeers(); }
    if (isSharer && localStream.current) {
      (session.participants || []).forEach((p) => {
        if (p.role !== 'viewer') return;
        if (p.left_at) { const pc = peers.current.get(String(p.user_id)); if (pc) { try { pc.close(); } catch { /* closed */ } peers.current.delete(String(p.user_id)); } return; }
        if (!peers.current.has(String(p.user_id))) offerViewer(p.user_id).catch(() => {});
      });
    }
    if (joinedRef.current && session?.status !== 'active') { joinedRef.current = null; cleanupMedia(); closePeers(); }
    if (session?.status !== 'active' && Number(session?.sharer_id) === Number(selfId)) { cleanupMedia(); closePeers(); }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Video elements mount after the session starts; attach the streams once they exist.
  useEffect(() => {
    const local = localVideoRef.current;
    if (isSharer && local && localStream.current && local.srcObject !== localStream.current) { local.srcObject = localStream.current; local.muted = true; local.play?.().catch(() => {}); }
    [remoteVideoRef.current, remoteAudioRef.current].forEach((el) => {
      if (el && remoteStream.current && el.srcObject !== remoteStream.current) { el.srcObject = remoteStream.current; el.play?.().catch(() => {}); }
    });
  });

  const stop = async (reason = 'Sharer stopped screen share') => {
    const live = sessionRef.current;
    cleanupMedia(); closePeers();
    if (!live || live.status !== 'active') return;
    try { const r = await chat.endSession(live.id, reason); setSession(r.data || null); setStatus('Sharing stopped.'); } catch { /* already ended */ }
  };

  const start = async ({ threadId, note, mic }) => {
    if (!teamId || busy) return false;
    setBusy('start'); setStatus('Choose what to share in the browser window…');
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const tracks = [...display.getVideoTracks(), ...display.getAudioTracks()];
      let micTracks = null;
      if (mic) { try { micTracks = await navigator.mediaDevices.getUserMedia({ audio: true }); tracks.push(...micTracks.getAudioTracks()); } catch { /* no mic */ } }
      localStream.current = new MediaStream(tracks); displayStream.current = display; micStream.current = micTracks;
      if (localVideoRef.current) { localVideoRef.current.srcObject = localStream.current; localVideoRef.current.muted = true; localVideoRef.current.play?.().catch(() => {}); }
      display.getVideoTracks()[0].onended = () => stop('Sharer stopped screen share');
      const r = await chat.startSession(teamId, { thread_id: threadId || undefined, note: note || null });
      setSession(r.data || null); setStatus('You are live.');
      return true;
    } catch (error) {
      cleanupMedia(); closePeers();
      setStatus(error?.name === 'NotAllowedError' ? 'Sharing was cancelled.' : errorOf(error, 'Could not start sharing.'));
      return false;
    } finally { setBusy(''); }
  };

  const join = async ({ mic }) => {
    const live = sessionRef.current;
    if (!live || busy) return;
    setBusy('join'); viewerMic.current = mic;
    try {
      if (mic) { try { await prepareViewerMic(); } catch { /* listen only */ } }
      const r = await chat.joinSession(live.id);
      joinedRef.current = live.id; setSession(r.data || null); setStatus('Connecting to the shared screen…');
    } catch (error) { setStatus(errorOf(error, 'Could not join.')); }
    finally { setBusy(''); }
  };

  const leave = async () => {
    const id = joinedRef.current;
    joinedRef.current = null; cleanupMedia(); closePeers();
    if (id) { try { const r = await chat.leaveSession(id); setSession(r.data || null); } catch { /* ignore */ } }
  };

  const decide = async (decision, remark) => {
    const live = sessionRef.current;
    if (!live) return false;
    try { const r = await chat.decideSession(live.id, decision, remark); setSession(r.data || null); return true; }
    catch (error) { setStatus(errorOf(error, 'Could not save the review.')); return false; }
  };

  useEffect(() => () => { if (joinedRef.current) chat.leaveSession(joinedRef.current).catch(() => {}); cleanupMedia(); closePeers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const viewerJoined = Boolean(joinedRef.current && session?.status === 'active');
  return { session, canReview, status, busy, isSharer, viewerJoined, remoteLive, localVideoRef, remoteVideoRef, remoteAudioRef, start, stop, join, leave, decide, reload: load };
}
