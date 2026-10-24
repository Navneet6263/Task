import { useEffect, useState } from 'react';
import { clients as clientsApi } from '../../services/api';

// The organization's client list for task forms. Cached per organization for a minute;
// Settings → Clients announces changes so open forms refresh.
let cache = null;
const orgKey = () => localStorage.getItem('active_org_id') || 'default';
const EMPTY = { clients: [], agents: [], pick_only: false, can_manage: false };

export function announceClientsChange() {
  cache = null;
  window.dispatchEvent(new Event('clients-changed'));
}

export default function useClients() {
  const fresh = cache && cache.org === orgKey() && Date.now() - cache.at < 60000;
  const [state, setState] = useState(() => (fresh ? cache.data : null));
  useEffect(() => {
    let active = true;
    const load = (force) => {
      if (!force && cache && cache.org === orgKey() && Date.now() - cache.at < 60000) { setState(cache.data); return; }
      Promise.resolve().then(() => clientsApi.list())
        .then((r) => { cache = { data: r.data, at: Date.now(), org: orgKey() }; if (active) setState(r.data); })
        .catch(() => { if (active) setState((prev) => prev || EMPTY); });
    };
    load(false);
    const onChange = () => load(true);
    window.addEventListener('clients-changed', onChange);
    return () => { active = false; window.removeEventListener('clients-changed', onChange); };
  }, []);
  // Older servers send no agents; always hand back every list.
  return state ? { ...EMPTY, ...state, agents: state.agents || [], clients: state.clients || [] } : EMPTY;
}
