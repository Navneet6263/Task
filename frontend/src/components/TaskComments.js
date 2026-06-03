import React, { useCallback, useEffect, useRef, useState } from 'react';
import { comments as commentsApi } from '../services/api';
import './TaskComments.css';

/* ─── avatar palette ─────────────────────────────────────────────── */
const AVATAR_PALETTE = [
  'linear-gradient(135deg, #2f5dff, #0ea5e9)',
  'linear-gradient(135deg, #10b981, #34d399)',
  'linear-gradient(135deg, #f97316, #fbbf24)',
  'linear-gradient(135deg, #8b5cf6, #a78bfa)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
  'linear-gradient(135deg, #06b6d4, #67e8f9)',
  'linear-gradient(135deg, #14b8a6, #2dd4bf)',
  'linear-gradient(135deg, #f59e0b, #fcd34d)',
];

const avatarGradient = (userId) =>
  AVATAR_PALETTE[(userId || 0) % AVATAR_PALETTE.length];

const firstLetter = (name) =>
  name ? String(name).trim()[0].toUpperCase() : '?';

/* ─── relative time helper ──────────────────────────────────────── */
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

/* ─── main component ────────────────────────────────────────────── */
const TaskComments = ({ taskId }) => {
  const currentUser = JSON.parse(
    localStorage.getItem('user') || localStorage.getItem('company_user') || '{}'
  );
  const currentUserId = currentUser?.id;

  const [commentList, setCommentList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newText, setNewText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const listRef = useRef(null);
  const textareaRef = useRef(null);

  /* ─ fetch comments ─ */
  const fetchComments = useCallback(async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      const res = await commentsApi.getByTask(taskId);
      setCommentList(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError('Could not load comments.');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  /* auto-scroll to bottom on new comment */
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [commentList]);

  /* ─ post new comment ─ */
  const handleSend = async () => {
    const text = newText.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await commentsApi.create({ task_id: taskId, comment: text });
      setCommentList((prev) => [...prev, res.data]);
      setNewText('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post comment.');
    } finally {
      setSending(false);
    }
  };

  /* Enter = send, Shift+Enter = new line */
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  /* ─ start editing ─ */
  const startEdit = (comment) => {
    setEditingId(comment.id);
    setEditText(comment.comment);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  /* ─ save edit ─ */
  const handleEditSave = async (commentId) => {
    const text = editText.trim();
    if (!text) return;
    try {
      const res = await commentsApi.update(commentId, { comment: text });
      setCommentList((prev) =>
        prev.map((c) => (c.id === commentId ? res.data : c))
      );
      cancelEdit();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update comment.');
    }
  };

  /* ─ delete comment ─ */
  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await commentsApi.delete(commentId);
      setCommentList((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete comment.');
    }
  };

  /* ─ render ─ */
  return (
    <div className="tc-root">
      <div className="tc-header">
        <p className="tc-title">
          Comments
          {!loading && (
            <span className="tc-count-badge">{commentList.length}</span>
          )}
        </p>
      </div>

      {loading && (
        <div className="tc-loading">
          <span className="tc-spinner" />
          Loading comments…
        </div>
      )}

      {!loading && commentList.length === 0 && (
        <div className="tc-empty">
          <span>💬</span>
          No comments yet. Be the first to add one!
        </div>
      )}

      {!loading && commentList.length > 0 && (
        <div className="tc-list" ref={listRef}>
          {commentList.map((c) => {
            const isOwn = c.user_id === currentUserId;
            const isEditing = editingId === c.id;
            const wasEdited =
              c.updated_at && c.created_at && c.updated_at !== c.created_at;

            return (
              <div className="tc-item" key={c.id}>
                {/* colored avatar */}
                <div
                  className="tc-avatar"
                  style={{ background: avatarGradient(c.user_id) }}
                >
                  {firstLetter(c.user_name)}
                </div>

                <div className="tc-body">
                  <div className="tc-meta">
                    <span className="tc-author">{c.user_name || 'Unknown'}</span>
                    <span className="tc-time">{timeAgo(c.created_at)}</span>
                    {wasEdited && (
                      <span className="tc-edited-tag">(edited)</span>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        className="tc-edit-area"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleEditSave(c.id);
                          }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                      />
                      <div className="tc-edit-actions">
                        <button
                          type="button"
                          className="tc-action-btn save"
                          onClick={() => handleEditSave(c.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="tc-action-btn cancel"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="tc-text">{c.comment}</p>
                      {isOwn && (
                        <div className="tc-actions">
                          <button
                            type="button"
                            className="tc-action-btn edit"
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="tc-action-btn delete"
                            onClick={() => handleDelete(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="tc-error">{error}</p>}

      {/* ── composer ── */}
      <div className="tc-composer">
        <textarea
          ref={textareaRef}
          className="tc-textarea"
          placeholder="Add a comment… (Enter to send, Shift+Enter for new line)"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <div className="tc-composer-footer">
          <span className="tc-hint">Enter ↵ to send · Shift+Enter for new line</span>
          <button
            type="button"
            className="tc-send-btn"
            onClick={handleSend}
            disabled={!newText.trim() || sending}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskComments;
