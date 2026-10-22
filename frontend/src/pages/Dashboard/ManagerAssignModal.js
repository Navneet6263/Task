import React from 'react';
import TaskSetupSection from './TaskComposer/TaskSetupSection';
import { Button, Input, Modal, Segmented, Select, Textarea } from '../../ui';

const ISSUE_TYPES = ['task', 'bug', 'feature', 'enhancement', 'story'];

const Label = ({ htmlFor, children, required }) => (
  <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{children}{required && <span className="text-danger"> *</span>}</label>
);

const ManagerAssignModal = ({ showMgrModal, setShowMgrModal, mgrForm, updateMgrFormField, handleManagerAssign, orgUsers, availableTaskOptions, mgrTaskCategories }) => {
  if (!showMgrModal) return null;
  const close = () => setShowMgrModal(false);
  const footer = <>
    <span className="flex-1" />
    <Button onClick={close}>Cancel</Button>
    <Button variant="primary" onClick={handleManagerAssign}>Assign task</Button>
  </>;

  return (
    <Modal title="Assign Task" subtitle="Delegate work to organization members directly" onClose={close} footer={footer} size="lg">
      <form className="flex flex-col gap-5" onSubmit={handleManagerAssign}>
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label htmlFor="mgr-title" required>Task Title</Label>
            <Input id="mgr-title" placeholder="What needs to be done?" value={mgrForm.title} onChange={(event) => updateMgrFormField('title', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label htmlFor="mgr-description">Description</Label>
            <Textarea id="mgr-description" className="min-h-[100px]" placeholder="Provide context, instructions, or goals..." value={mgrForm.description} onChange={(event) => updateMgrFormField('description', event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mgr-assignee" required>Assignee</Label>
            <Select id="mgr-assignee" value={mgrForm.assigned_to} onChange={(event) => updateMgrFormField('assigned_to', event.target.value)} required>
              <option value="">Select organization member...</option>
              {orgUsers.map((orgUser) => <option key={orgUser.id} value={orgUser.id}>{orgUser.name} ({orgUser.role})</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mgr-priority">Priority</Label>
            <Select id="mgr-priority" value={mgrForm.priority} onChange={(event) => updateMgrFormField('priority', event.target.value)}>
              <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Issue Type</span>
            <Segmented label="Issue type" value={mgrForm.issue_type} onChange={(value) => updateMgrFormField('issue_type', value)} options={ISSUE_TYPES.map((type) => [type, type])} className="w-full [&>button]:flex-1" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mgr-due">Due Date</Label>
            <Input id="mgr-due" type="date" value={mgrForm.due_date} onChange={(event) => updateMgrFormField('due_date', event.target.value)} />
          </div>
        </section>
        <TaskSetupSection taskForm={mgrForm} updateTaskFormField={updateMgrFormField} availableTaskOptions={availableTaskOptions} createTaskCategories={mgrTaskCategories} />
      </form>
    </Modal>
  );
};

export default ManagerAssignModal;
