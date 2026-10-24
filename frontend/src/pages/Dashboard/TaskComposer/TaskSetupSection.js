import React from 'react';
import ClientPicker from '../../../components/clients/ClientPicker';
import AgentPicker from '../../../components/clients/AgentPicker';
import useClients from '../../../components/clients/useClients';
import { ComposerSection } from './fields';
import { BugFields, EnhancementFields, FeatureFields, StoryFields, TaskFields } from './TypeFields';

const TITLES = { bug: 'Bug Details', feature: 'Feature Requirements', enhancement: 'Enhancement Details', story: 'Story Details', task: 'Task Setup' };

const TaskSetupSection = ({ taskForm: f, updateTaskFormField: u, availableTaskOptions: opts, createTaskCategories: cats }) => {
  const type = f.issue_type || 'task';
  const { clients, agents } = useClients();
  // Picking a client that sits under an agent fills the agent in.
  const pickClient = (value) => { u('client_name', value); const agent = clients.find((c) => c.name === value)?.agent_id; if (agent) u('agent_firm_id', String(agent)); };
  return (
    <ComposerSection step={3} title={TITLES[type] || 'Task Setup'} hint="Fields adapt automatically based on your selected issue type.">
      <div className="relative z-50">
        <div className={`grid grid-cols-1 gap-3 ${agents.length ? 'sm:grid-cols-2' : ''}`}>
          {agents.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="composer-agent" className="text-xs font-medium text-muted">Agent</label>
              <AgentPicker id="composer-agent" value={f.agent_firm_id || ''} onChange={(value) => u('agent_firm_id', value)} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="composer-client" className="text-xs font-medium text-muted">Client Name</label>
            <ClientPicker id="composer-client" value={f.client_name || ''} onChange={pickClient} agentId={f.agent_firm_id || null} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {type === 'bug' && <BugFields f={f} u={u} />}
        {type === 'feature' && <FeatureFields f={f} u={u} />}
        {type === 'enhancement' && <EnhancementFields f={f} u={u} />}
        {type === 'story' && <StoryFields f={f} u={u} />}
        {type === 'task' && <TaskFields f={f} u={u} opts={opts} cats={cats} />}
      </div>
    </ComposerSection>
  );
};

export default TaskSetupSection;
