import React from 'react';
import TaskCard from './TaskCard';

const TaskQueue = ({ title, icon, colorClass, tasks, statusValue, handleStatusChange, handlePriorityLock, openReassign, handleDrop, onCardClick }) => {
  return (
    <div 
      className={`flex flex-col bg-slate-50/50 rounded-3xl border border-slate-200/60 p-4 h-full min-h-[500px] transition-colors`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) handleDrop(taskId, statusValue);
      }}
    >
      <header className="flex justify-between items-center mb-4 px-1">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-sm ${colorClass}`}>
            {icon}
          </span>
          <h3 className="font-display font-extrabold text-slate-800 tracking-tight">{title}</h3>
        </div>
        <span className="bg-white border border-slate-200 text-slate-500 font-bold text-[10px] px-2.5 py-1 rounded-full shadow-sm">
          {tasks.length}
        </span>
      </header>
      
      <div className="flex flex-col gap-3 flex-1">
        {tasks.map(task => (
          <TaskCard 
            key={task.id} 
            task={task} 
            handleStatusChange={handleStatusChange} 
            handlePriorityLock={handlePriorityLock} 
            openReassign={openReassign} 
            onCardClick={onCardClick}
          />
        ))}
        
        {tasks.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl opacity-60">
            <span className="text-2xl mb-2 grayscale opacity-50">{icon}</span>
            <p className="text-xs font-bold text-slate-400">No tasks here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskQueue;
