import React from 'react';
import { useNavigate } from 'react-router-dom';
import { tasks } from '../../services/api';
import { Button, Select } from '../../ui';
import SnoozeMenu from './SnoozeMenu';
import useCommunicationsEnabled from '../Communications/useCommunicationsEnabled';
import { STATUS_LABEL } from './tones';

const STATUS_OPTIONS = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

// The actions cell of one task row. Clicks never open the task itself.
export default function TaskRowActions({ task, userId, handleStatusChange, handleSnooze, handleDelete, handleApproveDelete, handleRejectDelete, handlePickBug, handleResolveBug }) {
  const navigate = useNavigate();
  const canEmail = useCommunicationsEnabled();

  const handleMailClick = async () => {
    let detail;
    try { detail = (await tasks.getDetail(task.id)).data; } catch { alert('Unable to load full task details. Please retry.'); return; }
    localStorage.setItem('comm_task_context', JSON.stringify({
      id: detail.id, title: detail.title, description: detail.description,
      issue_type: detail.issue_type, priority: detail.priority, status: detail.status,
      client_name: detail.client_name || '', assigned_to_name: detail.assigned_to_name || '',
    }));
    navigate('/communications');
  };
  const isOpenBug = task.issue_type === 'bug' && task.status !== 'DONE';

  return (
    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      {canEmail && (
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Send email about this task" aria-label="Send email about this task" onClick={handleMailClick}>
          <SendIcon />
        </Button>
      )}
      {isOpenBug && !task.picked_by && <Button size="sm" onClick={() => handlePickBug(task.id)}>Pick</Button>}
      {isOpenBug && task.picked_by && <Button size="sm" onClick={() => handleResolveBug(task.id)}>Resolve</Button>}
      {task.issue_type !== 'bug' && (
        <Select aria-label={`Status of ${task.title}`} className="!w-auto min-w-[118px] py-1 text-xs" value={task.status} onChange={(event) => handleStatusChange(task, event.target.value)}>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
        </Select>
      )}
      <SnoozeMenu task={task} onSnooze={handleSnooze} />
      {task.delete_requested_by ? (
        task.assigned_by === userId ? (
          <>
            <Button size="sm" variant="danger" className="!border-danger/40" onClick={() => handleApproveDelete(task.id)}>Approve Delete</Button>
            <Button size="sm" onClick={() => handleRejectDelete(task.id)}>Reject</Button>
          </>
        ) : <span className="px-1 text-xs font-semibold text-danger">Delete Pending</span>
      ) : <Button size="sm" variant="danger" onClick={() => handleDelete(task.id)}>Delete</Button>}
    </div>
  );
}
