import { useEffect, useState } from 'react';
import { ls } from './utils';
import { isNight } from './sun';

const MODES = ['auto', 'clair', 'sombre'];

export default function useTheme() {
  const [mode, setMode] = useState(() => ls.get('ge_theme') || 'auto');
  useEffect(() => {
    const apply = () => {
      // Auto : sombre entre le coucher et le lever du soleil (calculés pour Paris, chaque jour)
      const dark = mode === 'sombre' || (mode === 'auto' && isNight());
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    ls.set('ge_theme', mode);
    const i = setInterval(apply, 60000);
    return () => clearInterval(i);
  }, [mode]);
  const cycle = () => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);
  return [mode, cycle];
}
