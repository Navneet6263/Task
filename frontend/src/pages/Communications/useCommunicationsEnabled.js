import { useEffect, useState } from 'react';
import { communications } from '../../services/api';

// Communications is an add-on the super admin turns on per organization. null while checking.
export default function useCommunicationsEnabled() {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => communications.status())
      .then((r) => { if (active) setEnabled(Boolean(r.data?.enabled)); })
      .catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  return enabled;
}
