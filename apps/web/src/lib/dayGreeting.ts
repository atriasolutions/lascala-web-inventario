/**
 * Saludo por franja horaria (Chile): mañana / tarde / noche.
 * Una sola fuente para header desktop y hero mobile del Dashboard.
 */
export type DayPartGreeting = 'Buenos días' | 'Buenas tardes' | 'Buenas noches';

/** 05–11 mañana · 12–19 tarde · 20–04 noche (hora local del dispositivo). */
export function dayPartGreeting(now: Date = new Date()): DayPartGreeting {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function firstGivenName(fullName?: string | null, fallback = 'equipo'): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first || fallback;
}

/** Ej.: «Buenos días, Rodrigo» */
export function personalDayGreeting(fullName?: string | null, now?: Date): string {
  return `${dayPartGreeting(now)}, ${firstGivenName(fullName)}`;
}
