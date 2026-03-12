import React, { useEffect, useState } from 'react';
import { analytics, teams } from '../services/api';
import './Reports.css';

const Reports = () => {
  const [teamList, setTeamList] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [energy, setEnergy] = useState([]);
  const [behavioral, setBehavioral] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [allWorkload, setAllWorkload] = useState([]);
  const [perfMap, setPerfMap] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    teams
      .getAll()
      .then((response) => {
        const list = Array.isArray(response.data) ? response.data : [];
        setTeamList(list);
        if (list.length > 0) loadTeam(list[0]);
      })
      .catch(() => {});
  }, []);

  const loadTeam = async (team) => {
    setSelectedTeam(team);
    setLoading(true);
    try {
      const [energyRes, behaviorRes, workloadRes] = await Promise.all([
        analytics.energy(team.id),
        analytics.behavioral(team.id),
        analytics.suggestAssignee(team.id, 'HIGH'),
      ]);

      setEnergy(Array.isArray(energyRes.data) ? energyRes.data : []);
      setBehavioral(behaviorRes.data || null);
      setSuggested(workloadRes.data?.suggested || null);
      setAllWorkload(Array.isArray(workloadRes.data?.all) ? workloadRes.data.all : []);

      const perf = {};
      await Promise.all(
        (workloadRes.data?.all || []).map(async (member) => {
          try {
            const response = await analytics.performance(member.id);
            perf[member.id] = response.data;
          } catch (error) {}
        })
      );
      setPerfMap(perf);
    } catch (error) {}
    setLoading(false);
  };

  return (
    <div className="reports-page">
      <header className="reports-head">
        <h1>Reports & Analytics</h1>
        <p>Team intelligence for workload, performance, and behavioral signals.</p>
      </header>

      <section className="reports-team-tabs">
        {teamList.map((team) => (
          <button
            key={team.id}
            type="button"
            className={selectedTeam?.id === team.id ? 'is-active' : ''}
            onClick={() => loadTeam(team)}
          >
            {team.name}
          </button>
        ))}
      </section>

      {loading && <div className="reports-loading">Loading analytics...</div>}

      {!loading && selectedTeam && (
        <>
          <section className="reports-card">
            <div className="reports-card-head">
              <h2>Task Energy Score</h2>
              <span>Current team workload pressure</span>
            </div>

            <div className="reports-energy-grid">
              {energy.map((member) => (
                <article key={member.id} className="reports-energy-card">
                  <span>{initials(member.name)}</span>
                  <h4>{member.name}</h4>
                  <div className="reports-energy-bar">
                    <div style={{ width: `${member.energy_score}%`, background: energyColor(member.energy_score) }} />
                  </div>
                  <p style={{ color: energyColor(member.energy_score) }}>{member.energy_score}%</p>
                  <small>{energyLabel(member.energy_score)}</small>
                </article>
              ))}

              {energy.length === 0 && <p className="reports-empty">No members found.</p>}
            </div>
          </section>

          <section className="reports-two-col">
            <article className="reports-card">
              <div className="reports-card-head">
                <h2>Workload Suggestion</h2>
                <span>Recommended assignee for high priority task</span>
              </div>

              {suggested && (
                <div className="reports-suggested">
                  <span>{initials(suggested.name)}</span>
                  <div>
                    <strong>{suggested.name}</strong>
                    <small>
                      Active: {suggested.active_tasks} | Overdue: {suggested.overdue} | Energy: {suggested.energy_score}%
                    </small>
                  </div>
                </div>
              )}

              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Active</th>
                      <th>High Priority</th>
                      <th>Overdue</th>
                      <th>Energy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allWorkload.map((member) => (
                      <tr key={member.id} className={suggested?.id === member.id ? 'is-highlight' : ''}>
                        <td>{member.name}</td>
                        <td>{member.active_tasks}</td>
                        <td>{member.high_priority}</td>
                        <td>{member.overdue}</td>
                        <td>{member.energy_score}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="reports-card">
              <div className="reports-card-head">
                <h2>Performance Index</h2>
                <span>On-time and completion quality score</span>
              </div>

              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Score</th>
                      <th>Grade</th>
                      <th>Done</th>
                      <th>On-Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allWorkload.map((member) => {
                      const perf = perfMap[member.id];
                      return (
                        <tr key={member.id}>
                          <td>{member.name}</td>
                          <td>{perf?.performance_index ?? '-'}</td>
                          <td>{perf?.grade ?? '-'}</td>
                          <td>{perf?.completed ?? '-'}</td>
                          <td>{perf?.on_time ?? '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {behavioral && (
            <section className="reports-card">
              <div className="reports-card-head">
                <h2>Behavioral Signals</h2>
                <span>Bottlenecks, after-hours activity, and fast delivery</span>
              </div>

              <div className="reports-behavior-grid">
                <div>
                  <h4>Bottlenecks</h4>
                  {(behavioral.bottlenecks || []).length === 0 && <p className="reports-empty">No bottlenecks.</p>}
                  {(behavioral.bottlenecks || []).map((member) => (
                    <div key={member.id} className="reports-behavior-row">
                      <span>{member.name}</span>
                      <b>{member.stuck_tasks} stuck</b>
                    </div>
                  ))}
                </div>

                <div>
                  <h4>After-Hours</h4>
                  {(behavioral.after_hours || []).filter((member) => member.after_hours_count > 0).length === 0 && (
                    <p className="reports-empty">No after-hours activity.</p>
                  )}
                  {(behavioral.after_hours || [])
                    .filter((member) => member.after_hours_count > 0)
                    .map((member) => (
                      <div key={member.id} className="reports-behavior-row">
                        <span>{member.name}</span>
                        <b>{member.after_hours_count} actions</b>
                      </div>
                    ))}
                </div>

                <div>
                  <h4>Fast Delivery</h4>
                  {(behavioral.fast_delivery || []).filter((member) => member.total_done > 0).length === 0 && (
                    <p className="reports-empty">No completed tasks yet.</p>
                  )}
                  {(behavioral.fast_delivery || [])
                    .filter((member) => member.total_done > 0)
                    .map((member) => (
                      <div key={member.id} className="reports-behavior-row">
                        <span>{member.name}</span>
                        <b>
                          {member.before_deadline}/{member.total_done} on time
                        </b>
                      </div>
                    ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

const initials = (name) => {
  if (!name) return 'US';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const energyColor = (score) => {
  if (score >= 80) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return '#f97316';
  return '#ef4444';
};

const energyLabel = (score) => {
  if (score >= 80) return 'Available';
  if (score >= 50) return 'Moderate';
  if (score >= 25) return 'High Load';
  return 'Burnout Risk';
};

export default Reports;
