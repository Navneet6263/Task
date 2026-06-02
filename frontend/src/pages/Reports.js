import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics, teams } from '../services/api';
import './Reports.css';

const Reports = () => {
  const location = useLocation();
  const sprintPlannerRef = useRef(null);
  const [teamList, setTeamList] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [energy, setEnergy] = useState([]);
  const [behavioral, setBehavioral] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [allWorkload, setAllWorkload] = useState([]);
  const [perfMap, setPerfMap] = useState({});
  const [loading, setLoading] = useState(false);
  const focusSprint = new URLSearchParams(location.search).get('focus') === 'sprint';

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

  const averageEnergy = useMemo(() => {
    if (energy.length === 0) return 0;
    return Math.round(energy.reduce((total, member) => total + Number(member.energy_score || 0), 0) / energy.length);
  }, [energy]);

  const performanceSummary = useMemo(() => {
    const performanceList = allWorkload
      .map((member) => perfMap[member.id])
      .filter(Boolean);

    if (performanceList.length === 0) {
      return {
        averagePerformance: 0,
        onTimeRate: 0,
      };
    }

    const averagePerformance = Math.round(
      performanceList.reduce((total, item) => total + Number(item.performance_index || 0), 0) /
        performanceList.length
    );
    const totalCompleted = performanceList.reduce((total, item) => total + Number(item.completed || 0), 0);
    const totalOnTime = performanceList.reduce((total, item) => total + Number(item.on_time || 0), 0);

    return {
      averagePerformance,
      onTimeRate: totalCompleted ? Math.round((totalOnTime / totalCompleted) * 100) : 0,
    };
  }, [allWorkload, perfMap]);

  const bottleneckCount = useMemo(
    () =>
      (behavioral?.bottlenecks || []).reduce(
        (total, member) => total + Number(member.stuck_tasks || 0),
        0
      ),
    [behavioral]
  );

  const afterHoursCount = useMemo(
    () =>
      (behavioral?.after_hours || []).reduce(
        (total, member) => total + Number(member.after_hours_count || 0),
        0
      ),
    [behavioral]
  );

  const readyMembers = useMemo(
    () => energy.filter((member) => Number(member.energy_score || 0) >= 50).length,
    [energy]
  );

  const deliveryConfidence = useMemo(() => {
    const rawScore =
      averageEnergy * 0.45 +
      performanceSummary.averagePerformance * 0.45 +
      Math.min(readyMembers * 4, 20) -
      Math.min(bottleneckCount * 7, 28) -
      Math.min(afterHoursCount * 2, 12);

    return Math.max(0, Math.min(100, Math.round(rawScore)));
  }, [afterHoursCount, averageEnergy, bottleneckCount, performanceSummary.averagePerformance, readyMembers]);

  const confidenceTone =
    deliveryConfidence >= 75 ? 'good' : deliveryConfidence >= 50 ? 'steady' : 'risk';

  const confidenceLabel =
    deliveryConfidence >= 75 ? 'High confidence' : deliveryConfidence >= 50 ? 'Watch scope' : 'Needs cleanup';

  const planningNote = useMemo(() => {
    if (!selectedTeam) return 'Pick a team to start planning the next sprint.';

    if (bottleneckCount > 0) {
      return `${selectedTeam.name} has ${bottleneckCount} stuck item${
        bottleneckCount > 1 ? 's' : ''
      }. Clear blockers first, then commit the next sprint batch.`;
    }

    if (suggested) {
      return `${suggested.name} currently has the best capacity for the next high priority item. Use the workload table below before locking ownership.`;
    }

    if (energy.length === 0) {
      return `No live workload signal is available for ${selectedTeam.name} yet. Start with active assignments and this planner will become more accurate.`;
    }

    return `${selectedTeam.name} looks balanced for the next sprint. Keep delivery confidence above 70% and watch the on-time rate before adding more scope.`;
  }, [bottleneckCount, energy.length, selectedTeam, suggested]);

  useEffect(() => {
    if (!focusSprint || loading || !selectedTeam || !sprintPlannerRef.current) return;
    sprintPlannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusSprint, loading, selectedTeam]);

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
          <section
            ref={sprintPlannerRef}
            className={`reports-card reports-sprint-card ${focusSprint ? 'is-spotlight' : ''}`}
          >
            <div className="reports-sprint-top">
              <div className="reports-card-head reports-card-head--stack">
                <div>
                  <p className="reports-eyebrow">Sprint Planner</p>
                  <h2>{selectedTeam.name} planning board</h2>
                  <span>Read delivery confidence, bottlenecks, and team capacity before you commit the next sprint.</span>
                </div>
              </div>

              <div className={`reports-confidence-chip ${confidenceTone}`}>
                <strong>{deliveryConfidence}%</strong>
                <span>{confidenceLabel}</span>
              </div>
            </div>

            <div className="reports-sprint-grid">
              <article className="reports-sprint-metric">
                <span>Ready Capacity</span>
                <strong>
                  {readyMembers}/{energy.length || 0}
                </strong>
                <p>Members with moderate or better energy who can absorb new work safely.</p>
              </article>

              <article className="reports-sprint-metric">
                <span>Bottlenecks</span>
                <strong>{bottleneckCount}</strong>
                <p>Tasks stuck in progress for more than three days and likely slowing delivery.</p>
              </article>

              <article className="reports-sprint-metric">
                <span>Team Energy</span>
                <strong>{averageEnergy}%</strong>
                <p>Average capacity signal based on active priority load and overdue work.</p>
              </article>

              <article className="reports-sprint-metric">
                <span>On-Time Rate</span>
                <strong>{performanceSummary.onTimeRate}%</strong>
                <p>How often the team is closing completed work before the due date.</p>
              </article>
            </div>

            <div className="reports-sprint-note">
              <strong>Suggested next move</strong>
              <p>{planningNote}</p>
            </div>
          </section>

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
