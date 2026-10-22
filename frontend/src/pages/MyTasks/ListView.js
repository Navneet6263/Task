import React from 'react';
import { Chip, EmptyRow, Select, Table, TableWrap, Td, Th } from '../../ui';
import TaskActions from './TaskActions';
import { DUE_TEXT, PRIORITY_TONE, STATUSES, dueInfo } from './taskMeta';

export default function ListView({ tasks, onOpen, handleStatusChange, handlePriorityLock, openReassign }) {
  return (
    <TableWrap>
      <Table>
        <thead><tr><Th>Task</Th><Th>Team</Th><Th>Priority</Th><Th>Status</Th><Th>Due</Th><Th>Assigned by</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
        <tbody>
          {tasks.map((task) => {
            const due = dueInfo(task);
            return (
              <tr key={task.id} className="group cursor-pointer hover:bg-subtle" onClick={() => onOpen(task)}>
                <Td className="align-middle">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <strong className={`font-semibold ${task.status === 'DONE' ? 'text-muted line-through' : ''}`}>{task.title}</strong>
                    {task.blocked_reason && <span title={task.blocked_reason}><Chip tone="warn">Blocked</Chip></span>}
                    {task.unread_comments > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{task.unread_comments}</span>}
                  </span>
                </Td>
                <Td className="whitespace-nowrap align-middle text-muted">{task.team_name}</Td>
                <Td className="align-middle"><Chip tone={PRIORITY_TONE[task.priority] || 'warn'}>{task.priority}</Chip></Td>
                <Td className="align-middle" onClick={(event) => event.stopPropagation()}>
                  <Select aria-label={`Status of ${task.title}`} className="!w-auto min-w-[124px] py-1 text-xs" value={task.status} onChange={(event) => handleStatusChange(task, event.target.value)}>
                    {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </Td>
                <Td className={`whitespace-nowrap align-middle font-medium ${DUE_TEXT[due.tone]}`}>{due.text}</Td>
                <Td className="whitespace-nowrap align-middle text-muted">{task.assigned_by_name || 'System'}</Td>
                <Td align="right" className="align-middle"><TaskActions task={task} onLock={handlePriorityLock} onReassign={openReassign} className="justify-end opacity-50 group-hover:opacity-100" /></Td>
              </tr>
            );
          })}
          {!tasks.length && <EmptyRow colSpan={7}>No tasks match these filters.</EmptyRow>}
        </tbody>
      </Table>
    </TableWrap>
  );
}
