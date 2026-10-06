import { describe, expect, it } from 'vitest';
import { fastState } from './fasting';
import {
  everyDayPlan,
  hoursBetween,
  lastScheduledFast,
  nextFastAfter,
  ramadanPreset,
  sunnahPreset,
  weekdayIndex,
  type Schedule,
} from './schedule';
import type { DayPlan, FastRecord } from './types';

// Sep 28 2026 is a Monday; day 31 rolls over to Thu Oct 1.
const local = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);
const ms = (d: Date) => d.getTime();
const H = 3_600_000;

const MON = 0;
const WED = 2;
const sched = (week: DayPlan[] = everyDayPlan()): Schedule => ({ eatingHours: 8, usualStart: '20:00', week });
const withDays = (days: Record<number, DayPlan>): DayPlan[] => everyDayPlan().map((p, i) => days[i] ?? p);
const sunnah = sched(sunnahPreset('05:00', '19:00'));

describe('weekdayIndex', () => {
  it('counts Monday as 0 and Sunday as 6', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0);
    expect(weekdayIndex('2026-10-04')).toBe(6);
  });
});

describe('hoursBetween', () => {
  it('measures Suhoor to Iftar on the same day', () => expect(hoursBetween('05:00', '19:00')).toBe(14));
  it('wraps past midnight', () => expect(hoursBetween('20:00', '14:00')).toBe(18));
  it('reads equal times as a full day', () => expect(hoursBetween('20:00', '20:00')).toBe(24));
});

describe('presets', () => {
  it('Sunnah puts dry 14h fasts on Monday and Thursday only', () => {
    const w = sunnahPreset();
    expect(w[0]).toEqual({ kind: 'custom', start: '05:00', hours: 14, dry: true });
    expect(w[3]).toEqual(w[0]);
    expect(w.filter((p) => p.kind === 'plan')).toHaveLength(5);
  });
  it('Ramadan fasts every day', () => {
    expect(ramadanPreset('04:30', '19:15').every((p) => p.kind === 'custom' && p.hours === 14.75 && p.dry)).toBe(true);
  });
});

describe('nextFastAfter', () => {
  it('without a schedule, starts when the eating window closes', () => {
    expect(nextFastAfter(sched(), ms(local(29, 14, 30)))).toEqual({ start: ms(local(29, 22, 30)), hours: 16, dry: false });
  });

  it('skips a plan fast that would run into the next custom fast', () => {
    // Wed fast ended at noon: a 20:00 16h fast would still run at Thursday's 05:00 Suhoor.
    expect(nextFastAfter(sunnah, ms(local(30, 12)))).toEqual({ start: ms(local(31, 5)), hours: 14, dry: true });
  });

  it('goes back to the plan after Iftar', () => {
    // Thursday's fast broken at 19:00 → 8h eating → Friday 03:00 plan fast.
    expect(nextFastAfter(sunnah, ms(local(31, 19)))).toEqual({ start: ms(local(32, 3)), hours: 16, dry: false });
  });

  it('starts a Monday-night fast that carries into Tuesday', () => {
    const s = sched(withDays({ [MON]: { kind: 'custom', start: '20:00', hours: 18, dry: false } }));
    // Sunday's fast ended Monday at noon: no plan fast on Monday, so the custom one is next.
    expect(nextFastAfter(s, ms(local(28, 12)))).toEqual({ start: ms(local(28, 20)), hours: 18, dry: false });
  });

  it('starts no fast on a rest day', () => {
    const s = sched(withDays({ [WED]: { kind: 'rest' } }));
    // Chained start lands Wednesday 20:00 → next plan day is Thursday at the usual start.
    expect(nextFastAfter(s, ms(local(30, 12))).start).toBe(ms(local(31, 20)));
    // A Tuesday fast still chains normally.
    expect(nextFastAfter(s, ms(local(29, 12))).start).toBe(ms(local(29, 20)));
  });

  it('still schedules a fast when every day is a rest day', () => {
    const s = sched(everyDayPlan().map(() => ({ kind: 'rest' })));
    expect(nextFastAfter(s, ms(local(29, 12))).start).toBe(ms(local(29, 20)));
  });

  it('with Ramadan, fasts again at the next Suhoor', () => {
    expect(nextFastAfter(sched(ramadanPreset()), ms(local(29, 19, 2))).start).toBe(ms(local(30, 5)));
  });
});

describe('lastScheduledFast', () => {
  it('picks a custom fast that started today', () => {
    expect(lastScheduledFast(sunnah, local(28, 9))).toEqual({ start: ms(local(28, 5)), hours: 14, dry: true });
  });
  it("picks the last plan start, skipping today's custom fast that hasn't started", () => {
    // Monday 03:00: Monday's Suhoor fast is later; Sunday's 20:00 plan fast is the latest.
    expect(lastScheduledFast(sunnah, local(28, 3)).start).toBe(ms(local(27, 20)));
  });
  it('skips rest days', () => {
    const s = sched(withDays({ [MON]: { kind: 'rest' } }));
    expect(lastScheduledFast(s, local(28, 22)).start).toBe(ms(local(27, 20)));
  });
});

describe('fastState with a schedule', () => {
  it('eats until the custom fast and shows it is dry', () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(29, 20)), end: ms(local(30, 12)) }];
    const s = fastState(local(30, 23), fasts, 8, '20:00', sunnah.week);
    expect(s.phase).toBe('eating');
    expect(s.end).toEqual(local(31, 5));
    expect(s.dry).toBe(true);
    expect(s.goalHours).toBe(14);
  });

  it('runs the dry fast with its own goal once Suhoor ends', () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(29, 20)), end: ms(local(30, 12)) }];
    const s = fastState(local(31, 18), fasts, 8, '20:00', sunnah.week);
    expect(s.phase).toBe('fasting');
    expect(s.start).toEqual(local(31, 5));
    expect(s.target).toEqual(local(31, 19));
    expect(s.over).toBe(false);
    expect(fastState(local(31, 19, 30), fasts, 8, '20:00', sunnah.week).over).toBe(true);
  });

  it('times an 18h Monday-night fast to Tuesday afternoon', () => {
    const week = withDays({ [MON]: { kind: 'custom', start: '20:00', hours: 18, dry: false } });
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(27, 20)), end: ms(local(28, 12)) }];
    const s = fastState(local(29, 9), fasts, 8, '20:00', week);
    expect(s.start).toEqual(local(28, 20));
    expect(s.target).toEqual(local(29, 14));
    expect(s.remainingMs).toBe(5 * H);
  });

  it("keeps a saved fast's own goal even if the schedule changes", () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(28, 5)), goalHours: 14, dry: true }];
    const s = fastState(local(28, 10), fasts, 8, '20:00');
    expect(s.target).toEqual(local(28, 19));
    expect(s.dry).toBe(true);
  });

  it("gives older saved fasts their start day's goal", () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(28, 5)) }];
    expect(fastState(local(28, 10), fasts, 8, '20:00', sunnah.week).goalHours).toBe(14);
    expect(fastState(local(28, 10), fasts, 8, '20:00').goalHours).toBe(16);
  });

  it('a moved next fast takes the goal of the day it lands on', () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(29, 20)), end: ms(local(30, 12)), nextStart: ms(local(31, 4, 45)) }];
    const s = fastState(local(31, 6), fasts, 8, '20:00', sunnah.week);
    expect(s.start).toEqual(local(31, 4, 45));
    expect(s.dry).toBe(true);
  });
});
