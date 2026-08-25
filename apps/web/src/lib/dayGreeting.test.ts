import { describe, expect, it } from 'vitest';
import { dayPartGreeting, firstGivenName, personalDayGreeting } from './dayGreeting';

describe('dayGreeting', () => {
  it('usa franjas mañana / tarde / noche', () => {
    expect(dayPartGreeting(new Date(2026, 7, 25, 5, 0))).toBe('Buenos días');
    expect(dayPartGreeting(new Date(2026, 7, 25, 11, 59))).toBe('Buenos días');
    expect(dayPartGreeting(new Date(2026, 7, 25, 12, 0))).toBe('Buenas tardes');
    expect(dayPartGreeting(new Date(2026, 7, 25, 19, 59))).toBe('Buenas tardes');
    expect(dayPartGreeting(new Date(2026, 7, 25, 20, 0))).toBe('Buenas noches');
    expect(dayPartGreeting(new Date(2026, 7, 25, 4, 59))).toBe('Buenas noches');
  });

  it('arma saludo con primer nombre', () => {
    expect(personalDayGreeting('Rodrigo Alonso', new Date(2026, 7, 25, 9))).toBe(
      'Buenos días, Rodrigo',
    );
    expect(firstGivenName(null)).toBe('equipo');
  });
});
