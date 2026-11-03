// Lever / coucher du soleil (calcul astronomique NOAA simplifié, précis à ~1 min)
// Lieu : déduit du fuseau horaire du téléphone (aucune permission demandée) — Paris par défaut

// Fuseau -> grande ville [latitude, longitude]
const ZONES = {
  'Europe/Paris': [48.86, 2.35], 'Europe/Brussels': [50.85, 4.35], 'Europe/Luxembourg': [49.61, 6.13], 'Europe/Monaco': [43.74, 7.42],
  'Europe/Zurich': [47.37, 8.54], 'Europe/London': [51.51, -0.13], 'Europe/Dublin': [53.35, -6.26], 'Europe/Lisbon': [38.72, -9.14],
  'Europe/Madrid': [40.42, -3.70], 'Europe/Rome': [41.90, 12.50], 'Europe/Berlin': [52.52, 13.40], 'Europe/Amsterdam': [52.37, 4.90],
  'Europe/Vienna': [48.21, 16.37], 'Europe/Warsaw': [52.23, 21.01], 'Europe/Athens': [37.98, 23.73], 'Europe/Istanbul': [41.01, 28.98],
  'Europe/Stockholm': [59.33, 18.07], 'Europe/Oslo': [59.91, 10.75], 'Europe/Copenhagen': [55.68, 12.57], 'Europe/Prague': [50.08, 14.44],
  'Europe/Bucharest': [44.43, 26.10], 'Europe/Kiev': [50.45, 30.52], 'Europe/Kyiv': [50.45, 30.52], 'Europe/Moscow': [55.76, 37.62],
  'Africa/Casablanca': [33.57, -7.59], 'Africa/Algiers': [36.75, 3.06], 'Africa/Tunis': [36.81, 10.18], 'Africa/Cairo': [30.04, 31.24],
  'Africa/Dakar': [14.72, -17.47], 'Africa/Abidjan': [5.36, -4.01], 'Africa/Bamako': [12.64, -8.00], 'Africa/Douala': [4.05, 9.77],
  'Africa/Kinshasa': [-4.44, 15.27], 'Africa/Lagos': [6.52, 3.38], 'Africa/Johannesburg': [-26.20, 28.05],
  'America/Guadeloupe': [16.24, -61.53], 'America/Martinique': [14.60, -61.07], 'America/Cayenne': [4.92, -52.33], 'America/Miquelon': [47.10, -56.38],
  'America/Port-au-Prince': [18.59, -72.31], 'America/Montreal': [45.50, -73.57], 'America/Toronto': [43.65, -79.38], 'America/New_York': [40.71, -74.01],
  'America/Chicago': [41.88, -87.63], 'America/Los_Angeles': [34.05, -118.24], 'America/Sao_Paulo': [-23.55, -46.63], 'America/Mexico_City': [19.43, -99.13],
  'Indian/Reunion': [-20.88, 55.45], 'Indian/Mayotte': [-12.78, 45.23], 'Indian/Mauritius': [-20.16, 57.50], 'Indian/Antananarivo': [-18.88, 47.51],
  'Pacific/Noumea': [-22.27, 166.44], 'Pacific/Tahiti': [-17.54, -149.57], 'Pacific/Wallis': [-13.28, -176.17],
  'Asia/Dubai': [25.20, 55.27], 'Asia/Tokyo': [35.68, 139.69], 'Asia/Shanghai': [31.23, 121.47], 'Asia/Bangkok': [13.76, 100.50],
  'Asia/Kolkata': [22.57, 88.36], 'Asia/Beirut': [33.89, 35.50], 'Asia/Jerusalem': [31.77, 35.21], 'Australia/Sydney': [-33.87, 151.21],
};
// Lieu approximatif du téléphone : ville du fuseau ; fuseau inconnu -> longitude d'après le décalage horaire
export function guessPlace(now = new Date()) {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* */ }
  if (ZONES[tz]) return ZONES[tz];
  if (!tz) return ZONES['Europe/Paris'];
  const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
  const std = Math.max(jan, jul); // heure d'hiver
  return [tz.startsWith('Australia') || tz.startsWith('Antarctica') ? -30 : 40, -std / 4];
}
const RAD = Math.PI / 180;
export function sunTimes(date = new Date(), lat = 48.8566, lon = 2.3522) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const n = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const g = (2 * Math.PI / 365) * (n - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const c = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  if (c >= 1) return { polar: 'night' };  // nuit polaire
  if (c <= -1) return { polar: 'day' };   // soleil de minuit
  const ha = Math.acos(c) / RAD;
  const utcMid = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const rise = new Date(utcMid + (720 - 4 * (lon + ha) - eqTime) * 60000);
  const set = new Date(utcMid + (720 - 4 * (lon - ha) - eqTime) * 60000);
  return { rise, set };
}
export const isNight = (now = new Date()) => {
  const t = sunTimes(now, ...guessPlace(now));
  if (t.polar) return t.polar === 'night';
  return now < t.rise || now >= t.set;
};
