import { MoonStar, Sun, SunMoon } from 'lucide-react';

export default function ThemeButton({ mode, cycle }) {
  const I = mode === 'auto' ? SunMoon : mode === 'clair' ? Sun : MoonStar;
  const label = mode === 'auto' ? 'Thème auto (sombre du coucher au lever du soleil, là où tu es)' : mode === 'clair' ? 'Thème clair' : 'Thème sombre';
  return <button className="icon-btn" onClick={cycle} title={label} aria-label={label}><I size={20} /></button>;
}
