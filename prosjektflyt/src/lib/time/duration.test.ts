import { describe, expect, it } from 'vitest';
import {
  calculateDurationFromStartEnd,
  formatHoursAndMinutes,
  hoursAndMinutesToMinutes,
  minutesToDecimalHours,
  minutesToHoursAndMinutes,
} from './duration';

describe('calculateDurationFromStartEnd', () => {
  it('08:00–12:15 gir 255 minutter', () => {
    expect(calculateDurationFromStartEnd('08:00', '12:15')).toBe(255);
  });

  it('håndterer vakt som krysser midnatt', () => {
    expect(calculateDurationFromStartEnd('22:00', '02:00')).toBe(240);
  });

  it('kaster feil på ugyldig format', () => {
    expect(() => calculateDurationFromStartEnd('8', '12:15')).toThrow();
  });
});

describe('minutesToDecimalHours', () => {
  it('255 minutter = 4,25 desimaltimer', () => {
    expect(minutesToDecimalHours(255)).toBe(4.25);
  });

  it('30 minutter = 0,5 desimaltimer', () => {
    expect(minutesToDecimalHours(30)).toBe(0.5);
  });
});

describe('minutesToHoursAndMinutes / formatHoursAndMinutes', () => {
  it('255 minutter = "4 t 15 min"', () => {
    expect(minutesToHoursAndMinutes(255)).toEqual({ hours: 4, minutes: 15 });
    expect(formatHoursAndMinutes(255)).toBe('4 t 15 min');
  });

  it('formaterer hele timer uten minutter-suffiks', () => {
    expect(formatHoursAndMinutes(120)).toBe('2 t');
  });

  it('formaterer under en time uten timer-suffiks', () => {
    expect(formatHoursAndMinutes(45)).toBe('45 min');
  });

  it('formaterer 0 minutter', () => {
    expect(formatHoursAndMinutes(0)).toBe('0 min');
  });

  it('kaster feil på negative minutter', () => {
    expect(() => minutesToHoursAndMinutes(-5)).toThrow();
  });
});

describe('hoursAndMinutesToMinutes', () => {
  it('4 t 15 min = 255 minutter', () => {
    expect(hoursAndMinutesToMinutes(4, 15)).toBe(255);
  });

  it('kaster feil når minutter >= 60', () => {
    expect(() => hoursAndMinutesToMinutes(1, 60)).toThrow();
  });
});
