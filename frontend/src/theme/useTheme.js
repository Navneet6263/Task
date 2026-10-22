import { useCallback, useEffect, useState } from 'react';
import { applyTheme, readPreference, resolveTheme, savePreference, watchSystemTheme } from './theme';

export default function useTheme() {
  const [preference, setPreference] = useState(readPreference);
  const [resolved, setResolved] = useState(() => resolveTheme(readPreference()));

  useEffect(() => { setResolved(applyTheme(preference)); }, [preference]);
  useEffect(() => watchSystemTheme(setResolved), []);

  const choose = useCallback((next) => { setPreference(next); setResolved(savePreference(next)); }, []);
  const toggle = useCallback(() => choose(resolved === 'dark' ? 'light' : 'dark'), [choose, resolved]);

  return { preference, resolved, choose, toggle };
}
