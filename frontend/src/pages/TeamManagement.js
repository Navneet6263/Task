import React, { useCallback, useEffect, useState } from 'react';
import { teams } from '../services/api';
import './TeamManagement.css';

const TeamManagement = () => {
  const [teamList, setTeamList] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [teamForm, setTeamForm] = useState({ name: '', type: '' });
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('Member');
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      const response = await teams.getAll();
      const list = Array.isArray(response.data) ? response.data : [];
      setTeamList(list);
      if (list.length > 0) {
        await selectTeam(list[0]);
      } else {
        setSelectedTeam(null);
        setMembers([]);
      }
    } catch (error) {}
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const selectTeam = async (team) => {
    setSelectedTeam(team);
    try {
      const response = await teams.getMembers(team.id);
      setMembers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  };

  const handleCreateTeam = async (event) => {
    event.preventDefault();
    try {
      await teams.create(teamForm);
      setTeamForm({ name: '', type: '' });
      setShowCreateTeam(false);
      await fetchTeams();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed');
    }
  };

  const handleAddMember = async (event) => {
    event.preventDefault();
    if (!selectedTeam) return;

    try {
      await teams.addMember(selectedTeam.id, { email: addEmail, role: addRole });
      setAddEmail('');
      await selectTeam(selectedTeam);
    } catch (error) {
      alert(error.response?.data?.error || 'User not found');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!selectedTeam) return;
    if (!window.confirm('Remove this member?')) return;

    try {
      await teams.removeMember(selectedTeam.id, userId);
      await selectTeam(selectedTeam);
    } catch (error) {}
  };

  return (
    <div className="team-page">
      <header className="team-head">
        <h1>Team Management</h1>
        <p>Create teams, add members, and balance workload.</p>
      </header>

      <section className="team-toolbar">
        <div className="team-chip-wrap">
          {teamList.map((team) => (
            <button
              key={team.id}
              type="button"
              className={`team-chip ${selectedTeam?.id === team.id ? 'is-active' : ''}`}
              onClick={() => selectTeam(team)}
            >
              {team.name}
            </button>
          ))}
        </div>

        <button type="button" className="team-create-btn" onClick={() => setShowCreateTeam(true)}>
          Create Team
        </button>
      </section>

      {selectedTeam && (
        <>
          <section className="team-card">
            <div className="team-code-box">
              <p>Team Join Code</p>
              <code>{selectedTeam.team_code || '-'}</code>
            </div>

            <h3>Add Member to {selectedTeam.name}</h3>
            <form className="team-add-form" onSubmit={handleAddMember}>
              <input
                type="email"
                required
                placeholder="Member email"
                value={addEmail}
                onChange={(event) => setAddEmail(event.target.value)}
              />
              <select value={addRole} onChange={(event) => setAddRole(event.target.value)}>
                <option value="Member">Member</option>
                <option value="Lead Developer">Lead Developer</option>
                <option value="UI Designer">UI Designer</option>
                <option value="Backend Developer">Backend Developer</option>
                <option value="Reporting Manager">Reporting Manager</option>
              </select>
              <button type="submit">Add Member</button>
            </form>
          </section>

          <section className="team-card">
            <h3>Members & Capacity</h3>

            <div className="team-table-wrap">
              <table className="team-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Tasks</th>
                    <th>Workload</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const ratio = Math.min((member.current_tasks || 0) * 15, 100);

                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="team-member-cell">
                            <span>{initials(member.name)}</span>
                            <div>
                              <strong>{member.name}</strong>
                              <small>{member.email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="team-role-cell">
                            <span>{member.role}</span>
                            {member.is_reporting_manager && <em>RM</em>}
                          </div>
                        </td>
                        <td>{member.current_tasks || 0}</td>
                        <td>
                          <div className="team-workload">
                            <div>
                              <span style={{ width: `${ratio}%` }} />
                            </div>
                            <small>{ratio}%</small>
                          </div>
                        </td>
                        <td>
                          {!member.is_reporting_manager && (
                            <button type="button" className="team-remove-btn" onClick={() => handleRemoveMember(member.id)}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!selectedTeam && (
        <section className="team-empty">
          <h2>No team found</h2>
          <p>Create your first team to start collaboration.</p>
        </section>
      )}

      {showCreateTeam && (
        <div className="team-overlay" onClick={() => setShowCreateTeam(false)}>
          <div className="team-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Create Team</h3>
            <form onSubmit={handleCreateTeam}>
              <input
                required
                placeholder="Team Name"
                value={teamForm.name}
                onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })}
              />
              <select value={teamForm.type} onChange={(event) => setTeamForm({ ...teamForm, type: event.target.value })}>
                <option value="">Select Team Type</option>
                <option value="Development">Development</option>
                <option value="Design">Design</option>
                <option value="Marketing">Marketing</option>
                <option value="Management">Management</option>
              </select>
              <div className="team-modal-actions">
                <button type="button" onClick={() => setShowCreateTeam(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const initials = (name) => {
  if (!name) return 'US';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

export default TeamManagement;
