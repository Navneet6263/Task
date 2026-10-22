import React, { useCallback, useEffect, useRef, useState } from 'react';
import { comments as commentsApi, tasks } from '../services/api';
import { Button, ErrorText, Loading, Textarea } from '../ui';

const firstLetter = (name) => (name ? String(name).trim()[0].toUpperCase() : '?');

const timeAgo = (isoString) => {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
};

function CommentItem({ comment: c, isOwn, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.comment);
  const wasEdited = c.updated_at && c.created_at && c.updated_at !== c.created_at;
  const save = async () => { if (text.trim() && await onSave(c.id, text.trim())) setEditing(false); };
  const cancel = () => { setEditing(false); setText(c.comment); };

  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{firstLetter(c.user_name)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{c.user_name || 'Unknown'}</span>
          <span className="text-xs text-muted">{timeAgo(c.created_at)}</span>
          {wasEdited && <span className="text-xs italic text-muted">(edited)</span>}
        </div>
        {editing ? (
          <>
            <Textarea className="mt-1" value={text} autoFocus onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save(); }
                if (event.key === 'Escape') cancel();
              }} />
            <div className="mt-1.5 flex gap-1.5"><Button size="sm" variant="primary" onClick={save}>Save</Button><Button size="sm" onClick={cancel}>Cancel</Button></div>
          </>
        ) : (
          <>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.comment}</p>
            {isOwn && (
              <div className="mt-1 flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => onDelete(c.id)}>Delete</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TaskComments = ({ taskId, members = [] }) => {
  const currentUser = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const currentUserId = currentUser?.id;
  const [commentList, setCommentList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newText, setNewText] = useState('');
  const [mentions, setMentions] = useState([]);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const fetchComments = useCallback(async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      const res = await commentsApi.getByTask(taskId);
      const rows = Array.isArray(res.data) ? res.data : [];
      setCommentList(rows);
      setError('');
      await tasks.markTaskViewed(taskId, Math.max(0, ...rows.map((comment) => Number(comment.id))));
    } catch { setError('Could not load comments.'); }
    finally { setLoading(false); }
  }, [taskId]);
  useEffect(() => { fetchComments(); }, [fetchComments]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [commentList]);

  const handleSend = async () => {
    const text = newText.trim();
    if (!text || sending) return;
    setSending(true); setError('');
    try {
      const res = await commentsApi.create({ task_id: taskId, comment: text, mentioned_user_ids: mentions });
      setCommentList((prev) => [...prev, res.data]);
      setNewText(''); setMentions([]);
    } catch (err) { setError(err.response?.data?.error || 'Failed to post comment.'); }
    finally { setSending(false); }
  };
  const handleEditSave = async (commentId, text) => {
    try {
      const res = await commentsApi.update(commentId, { comment: text });
      setCommentList((prev) => prev.map((c) => (c.id === commentId ? res.data : c)));
      return true;
    } catch (err) { setError(err.response?.data?.error || 'Failed to update comment.'); return false; }
  };
  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try { await commentsApi.delete(commentId); setCommentList((prev) => prev.filter((c) => c.id !== commentId)); }
    catch (err) { setError(err.response?.data?.error || 'Failed to delete comment.'); }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        Comments {!loading && <span className="rounded-full bg-subtle px-2 font-mono text-xs text-muted">{commentList.length}</span>}
      </p>
      {loading && <Loading>Loading comments...</Loading>}
      {!loading && commentList.length === 0 && <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No comments yet. Be the first to add one.</p>}
      {!loading && commentList.length > 0 && (
        <div className="flex max-h-[420px] flex-col gap-4 overflow-y-auto pr-1" ref={listRef}>
          {commentList.map((c) => <CommentItem key={c.id} comment={c} isOwn={c.user_id === currentUserId} onSave={handleEditSave} onDelete={handleDelete} />)}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-accent">Mention teammates ({mentions.length})</summary>
          <select multiple aria-label="Mention teammates" className="mt-2 w-full rounded-md border border-line bg-surface p-2 text-sm text-ink" value={mentions}
            onChange={(event) => setMentions([...event.target.selectedOptions].map((option) => option.value))}>
            {members.filter((member) => Number(member.id) !== Number(currentUserId)).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </details>
        <Textarea maxLength={5000} rows={2} aria-label="New comment" placeholder="Add a comment… (Enter to send, Shift+Enter for new line)"
          value={newText} onChange={(event) => setNewText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } }} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Enter to send · Shift+Enter for new line</span>
          <Button size="sm" variant="primary" onClick={handleSend} disabled={!newText.trim() || sending}>{sending ? 'Sending…' : 'Send'}</Button>
        </div>
      </div>
    </div>
  );
};

export default TaskComments;
