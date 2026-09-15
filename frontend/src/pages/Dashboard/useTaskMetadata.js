import { useEffect, useState } from 'react';
import { tasks, teams } from '../../services/api';
export default function useTaskMetadata(task) {
  const [members, setMembers] = useState([]);
  const [options, setOptions] = useState({ task_types: [], products: [], categories: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setMembers([]); setError('');
    Promise.all([teams.getMembers(task.team_id), tasks.getFormOptions()]).then(([people, choices]) => {
      if (active) { setMembers(people.data); setOptions(choices.data); }
    }).catch(() => { if (active) setError('Could not load all edit choices. Reopen the task to retry.'); });
    return () => { active = false; };
  }, [task.team_id]);
  return { members, options, error };
}
