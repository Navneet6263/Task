import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import UpdatesDialog from '../components/Updates/UpdatesDialog';
import '../components/Updates/Updates.css';
import '../components/Updates/UpdatesPage.css';

export default function UpdatesPage() {
  useEffect(() => {
    const previous = document.title; document.title = 'Product updates | GreenTask';
    const syncAccount = event => {
      if (!event.key || ['token', 'company_token', 'user', 'company_user', 'active_org_id'].includes(event.key)) window.location.reload();
    };
    window.addEventListener('storage', syncAccount);
    return () => { document.title = previous; window.removeEventListener('storage', syncAccount); };
  }, []);
  return <main className="updates-page">
    <header className="updates-page-nav"><BrandLogo /><Link to="/dashboard">Back to Dashboard</Link></header>
    <UpdatesDialog fullPage />
  </main>;
}
