import React, { useEffect, useState } from 'react';
import BulkTaskActions from './BulkTaskActions';
import TaskRowActions from './TaskRowActions';
import { EmptyRow, Td, Th } from '../../ui';
import useTaskColumns from './taskColumns/useTaskColumns';
import ColumnCustomizer, { GripIcon } from './taskColumns/ColumnCustomizer';

// Header cell that can be dragged onto another header to reorder columns.
function DraggableHeader({ column, dragId, overId, setDragId, setOverId, onDrop }) {
  const movable = !column.pinned;
  const isOver = overId === column.id && dragId && dragId !== column.id;
  return (
    <Th align={column.align}
      draggable={movable}
      onDragStart={(event) => { setDragId(column.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.id); }}
      onDragOver={(event) => { if (dragId && movable) { event.preventDefault(); setOverId(column.id); } }}
      onDragLeave={() => setOverId((current) => (current === column.id ? null : current))}
      onDrop={(event) => { event.preventDefault(); onDrop(column.id); }}
      onDragEnd={() => { setDragId(null); setOverId(null); }}
      title={movable ? 'Drag to reorder' : undefined}
      className={`group relative select-none ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === column.id ? 'opacity-40' : ''}`}>
      {isOver && <span className="absolute inset-y-1 left-0 w-0.5 rounded bg-accent" />}
      <span className="inline-flex items-center gap-1.5">
        {movable && <span className="text-muted/0 transition-colors group-hover:text-muted"><GripIcon /></span>}
        {column.label}
      </span>
    </Th>
  );
}

const TaskListView = ({ paginated, selectedTask, setSelectedTask, setSheetTab, onBulkDelete, members, onUpdated, ...actions }) => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const columns = useTaskColumns();
  const [selected, setSelected] = useState(new Set());
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const pageIds = paginated.map((task) => task.id).join(',');
  useEffect(() => { setSelected(new Set()); }, [pageIds]);

  const allSelected = paginated.length > 0 && paginated.every((task) => selected.has(task.id));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    paginated.forEach((task) => (allSelected ? next.delete(task.id) : next.add(task.id)));
    return next;
  });
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const open = (task) => { setSelectedTask(task); setSheetTab('details'); };
  const dropOn = (targetId) => { if (dragId) columns.move(dragId, targetId); setDragId(null); setOverId(null); };
  const visible = columns.visibleColumns;

  return (
    <div className="overflow-auto">
      <BulkTaskActions rows={paginated} members={members} onUpdated={onUpdated} selectedIds={[...selected]} onDelete={onBulkDelete} onClear={() => setSelected(new Set())} />
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">Drag a column header to move it.</p>
        <ColumnCustomizer columns={columns} />
      </div>
      <table className="task-list-table w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr>
            <Th className="w-10"><input type="checkbox" className="h-4 w-4 accent-accent" checked={allSelected} onChange={toggleAll} title="Select all on this page" aria-label="Select all on this page" /></Th>
            {visible.map((column) => (
              <DraggableHeader key={column.id} column={column} dragId={dragId} overId={overId} setDragId={setDragId} setOverId={setOverId} onDrop={dropOn} />
            ))}
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((task) => {
            const rowTone = selected.has(task.id) ? 'bg-danger-soft/60' : selectedTask?.id === task.id ? 'bg-accent-soft/60' : '';
            return (
              <tr key={task.id} className={`cursor-pointer hover:bg-subtle ${rowTone}`} onClick={() => open(task)}>
                <Td className="align-middle" onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" className="h-4 w-4 accent-danger" checked={selected.has(task.id)} onChange={() => toggleOne(task.id)} aria-label={`Select ${task.title}`} />
                </Td>
                {visible.map((column) => (
                  <Td key={column.id} align={column.align} className={`align-middle ${column.nowrap ? 'whitespace-nowrap' : ''}`}>{column.cell(task)}</Td>
                ))}
                <Td className="align-middle"><TaskRowActions task={task} userId={user.id} {...actions} /></Td>
              </tr>
            );
          })}
          {paginated.length === 0 && <EmptyRow colSpan={visible.length + 2}>No tasks found for selected filters.</EmptyRow>}
        </tbody>
      </table>
    </div>
  );
};

export default TaskListView;
