import { useEffect, useState } from 'react';
import { bugs } from '../../services/api';

// Bug tracking is an add-on the super admin turns on per workspace. null while checking.
export default function useBugTracking() {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => bugs.status())
      .then((r) => { if (active) setEnabled(Boolean(r.data?.enabled)); })
      .catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  return enabled;
}
