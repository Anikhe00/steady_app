import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKey,
  fastingStatus,
  neverMissTwiceStreak,
  rollingAverage,
  weekOf,
} from './dates';

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const fixed = (t: string) => () => t;

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

describe('fastingStatus', () => {
  // 16:8 with window 12:00–20:00
  it('is eating inside the window', () => {
    const s = fastingStatus(local(2026, 9, 28, 13), 8, fixed('12:00'));
    expect(s.phase).toBe('eating');
    expect(s.end).toEqual(local(2026, 9, 28, 20));
    expect(s.remainingMs).toBe(7 * 3_600_000);
  });

  it('counts down to tomorrow after the window closes', () => {
    const s = fastingStatus(local(2026, 9, 28, 22), 8, fixed('12:00'));
    expect(s.phase).toBe('fasting');
    expect(s.start).toEqual(local(2026, 9, 28, 20));
    expect(s.end).toEqual(local(2026, 9, 29, 12));
    expect(s.windowDay).toBe('2026-09-29');
    expect(s.progress).toBeCloseTo(2 / 16);
  });

  it('keeps fasting across midnight until the next window opens', () => {
    const s = fastingStatus(local(2026, 9, 29, 1), 8, fixed('12:00'));
    expect(s.phase).toBe('fasting');
    expect(s.start).toEqual(local(2026, 9, 28, 20));
    expect(s.end).toEqual(local(2026, 9, 29, 12));
    expect(s.progress).toBeCloseTo(5 / 16);
  });

  it("stays in yesterday's window when it runs past midnight", () => {
    // window 18:00–02:00
    const s = fastingStatus(local(2026, 9, 29, 1), 8, fixed('18:00'));
    expect(s.phase).toBe('eating');
    expect(s.windowDay).toBe('2026-09-28');
    expect(s.end).toEqual(local(2026, 9, 29, 2));
  });

  it('starts fasting after a past-midnight window closes', () => {
    const s = fastingStatus(local(2026, 9, 29, 3), 8, fixed('18:00'));
    expect(s.phase).toBe('fasting');
    expect(s.start).toEqual(local(2026, 9, 29, 2));
    expect(s.end).toEqual(local(2026, 9, 29, 18));
  });

  it('honours a shifted window for one day only', () => {
    const startFor = (d: string) => (d === '2026-09-28' ? '15:00' : '12:00');
    const late = fastingStatus(local(2026, 9, 28, 21), 8, startFor);
    expect(late.phase).toBe('eating');
    expect(late.end).toEqual(local(2026, 9, 28, 23));

    const next = fastingStatus(local(2026, 9, 29, 11), 8, startFor);
    expect(next.phase).toBe('fasting');
    expect(next.start).toEqual(local(2026, 9, 28, 23));
    expect(next.end).toEqual(local(2026, 9, 29, 12));
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

describe('fastingStatus with aggressive plans', () => {
  it('20:4 opens at 14:00 and closes at 18:00', () => {
    const eating = fastingStatus(local(2026, 9, 28, 17), 4, fixed('14:00'));
    expect(eating.phase).toBe('eating');
    expect(eating.end).toEqual(local(2026, 9, 28, 18));

    const fasting = fastingStatus(local(2026, 9, 28, 19), 4, fixed('14:00'));
    expect(fasting.phase).toBe('fasting');
    expect(fasting.end).toEqual(local(2026, 9, 29, 14));
    expect(fasting.progress).toBeCloseTo(1 / 20);
  });

  it('18:6 window running past midnight', () => {
    const s = fastingStatus(local(2026, 9, 29, 0, 30), 6, fixed('20:00'));
    expect(s.phase).toBe('eating');
    expect(s.end).toEqual(local(2026, 9, 29, 2));
  });
});
