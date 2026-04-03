import React from 'react';
import './AuthShowcase.css';

const variantContent = {
  workspace: {
    badge: 'Live Workspace',
    heading: 'Task operations are moving in real time.',
    subheading: 'Reviews, sprint syncs, and delivery updates stay visible across the team.',
    primaryCard: {
      label: 'Sprint Review',
      title: 'Daily execution window is active',
      detail: '12 people are working across design, QA, and development lanes.',
    },
    quickStats: [
      { value: '34', label: 'In progress' },
      { value: '08', label: 'Reviews today' },
      { value: '96%', label: 'On-time delivery' },
    ],
    floatingCards: [
      { title: 'Task Review', time: '09:30 AM - 10:00 AM' },
      { title: 'Manager Sync', time: '11:00 AM - 11:20 AM' },
      { title: 'QA Closure', time: '04:15 PM - 04:45 PM' },
    ],
  },
  security: {
    badge: 'Secure Control',
    heading: 'Administrative access stays deliberate and traceable.',
    subheading: 'Role checks, approval history, and access review remain visible before entry.',
    primaryCard: {
      label: 'Access Review',
      title: 'Administrative session is monitored',
      detail: 'Every privileged action is logged with actor details and approval history.',
    },
    quickStats: [
      { value: '24/7', label: 'Audit visibility' },
      { value: '03', label: 'Auth steps' },
      { value: '100%', label: 'Role based' },
    ],
    floatingCards: [
      { title: 'Privilege Check', time: 'Role verified' },
      { title: 'Activity Log', time: 'Streaming now' },
      { title: 'Approval Queue', time: '2 pending' },
    ],
  },
  onboarding: {
    badge: 'Launch Board',
    heading: 'Set up a company workspace with a clear rollout path.',
    subheading: 'Capture admin details, operating scale, and onboarding requirements in one flow.',
    primaryCard: {
      label: 'Onboarding Track',
      title: 'Workspace launch plan is ready',
      detail: 'Company setup, managers, and team capacity are mapped before approval.',
    },
    quickStats: [
      { value: '04', label: 'Setup stages' },
      { value: '01', label: 'Approval queue' },
      { value: 'Fast', label: 'Admin review' },
    ],
    floatingCards: [
      { title: 'Company Profile', time: 'Stage 2 active' },
      { title: 'Scale Planning', time: 'Managers + staff' },
      { title: 'Go Live', time: 'After approval' },
    ],
  },
};

const AuthShowcase = ({ variant = 'workspace' }) => {
  const content = variantContent[variant] || variantContent.workspace;

  return (
    <section className={`auth-showcase auth-showcase--${variant}`}>
      <div className="auth-showcase__surface" />
      <div className="auth-showcase__header">
        <span className="auth-showcase__badge">{content.badge}</span>
        <h3>{content.heading}</h3>
        <p>{content.subheading}</p>
      </div>

      <div className="auth-showcase__media">
        <div className="auth-showcase__window">
          <div className="auth-showcase__window-bar">
            <span />
            <span />
            <span />
          </div>

          <div className="auth-showcase__hero-card">
            <p>{content.primaryCard.label}</p>
            <strong>{content.primaryCard.title}</strong>
            <small>{content.primaryCard.detail}</small>
          </div>

          <div className="auth-showcase__metric-row">
            {content.quickStats.map((item) => (
              <article key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>

          <div className="auth-showcase__activity">
            <div className="auth-showcase__activity-head">
              <div>
                <p>Team activity</p>
                <strong>Execution timeline</strong>
              </div>
              <div className="auth-showcase__avatars">
                {['NK', 'RA', 'PS', 'MJ'].map((avatar) => (
                  <span key={avatar}>{avatar}</span>
                ))}
              </div>
            </div>

            <div className="auth-showcase__lane-list">
              {content.floatingCards.map((card) => (
                <div key={card.title} className="auth-showcase__lane">
                  <div className="auth-showcase__lane-dot" />
                  <div>
                    <strong>{card.title}</strong>
                    <small>{card.time}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="auth-showcase__float auth-showcase__float--top">
          <strong>{content.floatingCards[0].title}</strong>
          <span>{content.floatingCards[0].time}</span>
        </div>

        <div className="auth-showcase__float auth-showcase__float--middle">
          <p>Team Presence</p>
          <div className="auth-showcase__presence">
            <span />
            <span />
            <span />
          </div>
          <small>Everyone is aligned for the next move.</small>
        </div>

        <div className="auth-showcase__float auth-showcase__float--bottom">
          <p>Next Decision</p>
          <strong>{content.floatingCards[1].title}</strong>
          <small>{content.floatingCards[1].time}</small>
        </div>
      </div>
    </section>
  );
};

export default AuthShowcase;
