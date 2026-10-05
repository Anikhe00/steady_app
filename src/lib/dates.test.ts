import { describe, expect, it } from 'vitest';
import {
  addClock,
  addDays,
  fastStartFromWindow,
  scheduleFromFastStart,
  dateKey,
  isDateKey,
  logDay,
  neverMissTwiceStreak,
  rollingAverage,
  weekOf,
} from './dates';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('dateKey / addDays', () => {
  it('uses local calendar dates', () => {
    expect(dateKey(local(2026, 9, 28, 23, 59))).toBe('2026-09-28');
    expect(dateKey(local(2026, 9, 29, 0, 0))).toBe('2026-09-29');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('neverMissTwiceStreak', () => {
  const start = '2026-09-01';
  const today = '2026-09-20';
  const hits = (...days: string[]) => (d: string) => days.includes(d);

  it('counts a clean run including today', () => {
    const r = neverMissTwiceStreak(hits('2026-09-18', '2026-09-19', '2026-09-20'), today, '2026-09-18');
    expect(r).toEqual({ streak: 3, missedYesterday: false });
  });

  it('does not treat an unfinished today as a miss', () => {
    const r = neverMissTwiceStreak(hits('2026-09-18', '2026-09-19'), today, start);
    expect(r.streak).toBe(2);
    expect(r.missedYesterday).toBe(false);
  });

  it('forgives a single missed day', () => {
    const r = neverMissTwiceStreak(hits('2026-09-16', '2026-09-17', '2026-09-19', '2026-09-20'), today, start);
    expect(r.streak).toBe(4);
  });

  it('flags a miss yesterday without breaking the streak', () => {
    const r = neverMissTwiceStreak(hits('2026-09-17', '2026-09-18'), today, start);
    expect(r).toEqual({ streak: 2, missedYesterday: true });
  });

  it('breaks on two misses in a row', () => {
    const r = neverMissTwiceStreak(hits('2026-09-15', '2026-09-16', '2026-09-19', '2026-09-20'), today, start);
    expect(r.streak).toBe(2);
  });

  it('is zero after two missed days before today', () => {
    const r = neverMissTwiceStreak(hits('2026-09-17'), today, start);
    expect(r.streak).toBe(0);
    expect(r.missedYesterday).toBe(true);
  });

  it('ignores days before the start date', () => {
    const r = neverMissTwiceStreak(hits('2026-09-20'), today, today);
    expect(r).toEqual({ streak: 1, missedYesterday: false });
  });
});

describe('rollingAverage', () => {
  it('averages the trailing 7 days of weigh-ins', () => {
    const pts = [
      { date: '2026-09-01', value: 80 },
      { date: '2026-09-02', value: 82 },
      { date: '2026-09-07', value: 78 },
      { date: '2026-09-08', value: 79 },
    ];
    const r = rollingAverage(pts);
    expect(r.map((p) => p.value)).toEqual([80, 81, 80, (82 + 78 + 79) / 3]);
  });

  it('uses the last weigh-in of a day', () => {
    const r = rollingAverage([
      { date: '2026-09-01', value: 80 },
      { date: '2026-09-01', value: 79 },
    ]);
    expect(r).toEqual([{ date: '2026-09-01', value: 79 }]);
  });

  it('sorts unordered input', () => {
    const r = rollingAverage([
      { date: '2026-09-03', value: 70 },
      { date: '2026-09-01', value: 72 },
    ]);
    expect(r.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-03']);
    expect(r[1].value).toBe(71);
  });

  it('is empty with no weigh-ins', () => {
    expect(rollingAverage([])).toEqual([]);
  });
});

describe('weekOf', () => {
  it('returns Monday to Sunday', () => {
    const w = weekOf('2026-10-01'); // Thursday
    expect(w[0]).toBe('2026-09-28');
    expect(w[6]).toBe('2026-10-04');
  });
});

describe('schedule from fast start', () => {
  it('wraps clock times around midnight', () => {
    expect(addClock('20:00', 16)).toBe('12:00');
    expect(addClock('01:30', -2)).toBe('23:30');
  });

  it('works out the day for each plan from an 8 PM fast start', () => {
    expect(scheduleFromFastStart('20:00', 10)).toMatchObject({ fastEnd: '10:00', windowClose: '20:00', nextFastStart: '20:00', fastingHours: 14 });
    expect(scheduleFromFastStart('20:00', 8).fastEnd).toBe('12:00');
    expect(scheduleFromFastStart('20:00', 6).fastEnd).toBe('14:00');
    expect(scheduleFromFastStart('20:00', 4).fastEnd).toBe('16:00');
  });

  it('handles a fast that starts after midnight', () => {
    expect(scheduleFromFastStart('01:00', 8)).toMatchObject({ fastEnd: '17:00', windowClose: '01:00' });
  });

  it('round-trips with the stored window start', () => {
    const { fastEnd } = scheduleFromFastStart('19:30', 6);
    expect(fastStartFromWindow(fastEnd, 6)).toBe('19:30');
  });
});

describe('isDateKey', () => {
  it('accepts real dates and rejects anything else', () => {
    expect(isDateKey('2026-10-03')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-1-3')).toBe(false);
    expect(isDateKey('yesterday')).toBe(false);
  });
});

describe('logDay', () => {
  const today = '2026-10-05';
  const start = '2026-09-28';

  it('opens a past day that is being tracked', () => {
    expect(logDay('2026-10-04', today, start)).toBe('2026-10-04');
    expect(logDay(start, today, start)).toBe(start);
  });

  it('falls back to today with no day, a bad day, today or the future', () => {
    expect(logDay(undefined, today, start)).toBe(today);
    expect(logDay('2026-02-30', today, start)).toBe(today);
    expect(logDay(today, today, start)).toBe(today);
    expect(logDay('2026-10-06', today, start)).toBe(today);
  });

  it('stops at the day tracking started', () => {
    expect(logDay('2026-09-01', today, start)).toBe(start);
  });

  it('crosses month boundaries', () => {
    expect(logDay('2026-09-30', '2026-10-01', '2026-09-01')).toBe('2026-09-30');
  });
});
