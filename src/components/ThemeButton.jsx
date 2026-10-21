import { MoonStar, Sun, SunMoon } from 'lucide-react';

export default function ThemeButton({ mode, cycle }) {
  const I = mode === 'auto' ? SunMoon : mode === 'clair' ? Sun : MoonStar;
  const label = mode === 'auto' ? 'Thème auto (selon l’heure)' : mode === 'clair' ? 'Thème clair' : 'Thème sombre';
  return <button className="icon-btn" onClick={cycle} title={label} aria-label={label}><I size={20} /></button>;
}
