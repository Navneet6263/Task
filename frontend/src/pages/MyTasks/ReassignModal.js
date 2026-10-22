import React from 'react';
import { Button, Modal } from '../../ui';
import { initials } from './taskMeta';

const ReassignModal = ({ reassignModal, setReassignModal, teamMembers, selectedMember, setSelectedMember, handleReassign }) => {
  if (!reassignModal) return null;
  const close = () => setReassignModal(null);
  return (
    <Modal title="Reassign task" subtitle={reassignModal.title} onClose={close}
      footer={<><span className="flex-1" /><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={handleReassign} disabled={!selectedMember}>Reassign</Button></>}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Choose a team member</p>
      <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto" role="radiogroup" aria-label="Team members">
        {teamMembers.map((member) => {
          const active = selectedMember === member.id;
          return (
            <button key={member.id} type="button" role="radio" aria-checked={active} onClick={() => setSelectedMember(member.id)}
              className={`flex items-center gap-3 rounded-md border p-2.5 text-left ${active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted'}`}>{initials(member.name)}</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold">{member.name}</strong>
                <span className="block text-xs text-muted">{member.team_role || 'Member'} · {member.current_tasks ?? 0} active tasks</span>
              </span>
              {active && <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[10px] text-accent-fg">✓</span>}
            </button>
          );
        })}
        {!teamMembers.length && <p className="rounded-md border border-dashed border-line py-8 text-center text-sm text-muted">No other members available.</p>}
      </div>
    </Modal>
  );
};

export default ReassignModal;
