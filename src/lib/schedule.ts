import { addDays, at, dateKey, fastStartFromWindow, parseKey } from './dates';
import { EATING_HOURS, type ClockTime, type DateKey, type DayPlan, type Settings } from './types';

// The weekly schedule says what kind of fast each weekday has: your usual
// plan, a custom fast (fixed start and length, optionally dry), or a rest day
// with no fast. A fast belongs to the day it starts. Fasts still only end when
// you end them; the schedule decides when the next one starts and its goal.

const HOUR = 3_600_000;

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export interface Schedule {
  eatingHours: number;
  /** When a fast on a plan day starts, if nothing else decides it. */
  usualStart: ClockTime;
  /** Monday first. */
  week: DayPlan[];
}

/** A fast's start and goal. */
export interface PlannedFast {
  start: number;
  hours: number;
  dry: boolean;
}

export const PLAN_DAY: DayPlan = { kind: 'plan' };
export const everyDayPlan = (): DayPlan[] => WEEKDAYS.map(() => ({ kind: 'plan' }));

/** Monday = 0 … Sunday = 6. */
export const weekdayIndex = (key: DateKey) => (parseKey(key).getDay() + 6) % 7;

export function dayPlan(sched: Schedule, key: DateKey): DayPlan {
  return sched.week[weekdayIndex(key)] ?? PLAN_DAY;
}

export const isRestDay = (week: DayPlan[] | undefined, key: DateKey) => week?.[weekdayIndex(key)]?.kind === 'rest';

/** The goal for a fast starting at `start`, from the day it starts on. */
export function goalFor(sched: Schedule, start: number): { hours: number; dry: boolean } {
  const p = dayPlan(sched, dateKey(new Date(start)));
  return p.kind === 'custom' ? { hours: p.hours, dry: p.dry } : { hours: 24 - sched.eatingHours, dry: false };
}

const planFast = (sched: Schedule, start: number): PlannedFast => ({ start, hours: 24 - sched.eatingHours, dry: false });

/**
 * When the next fast starts after one ended at `end`, and its goal.
 *
 * - On a plan day, the next fast starts when the eating window closes
 *   (end + eating hours), as before.
 * - If that lands on a rest or custom day, no plan fast starts that day; the
 *   next plan fast is at your usual start on the next plan day.
 * - A custom fast starts at its set time. If a plan fast would still be
 *   running at that time, it's skipped and you eat until the custom fast.
 */
export function nextFastAfter(sched: Schedule, end: number): PlannedFast {
  const endKey = dateKey(new Date(end));
  let custom: PlannedFast | null = null;
  for (let i = 0; i <= 14 && !custom; i++) {
    const key = addDays(endKey, i);
    const p = dayPlan(sched, key);
    if (p.kind !== 'custom') continue;
    const start = at(key, p.start).getTime();
    if (start >= end) custom = { start, hours: p.hours, dry: p.dry };
  }

  const chained = end + sched.eatingHours * HOUR;
  const chainedKey = dateKey(new Date(chained));
  let plan: PlannedFast | null = null;
  if (dayPlan(sched, chainedKey).kind === 'plan') plan = planFast(sched, chained);
  for (let i = 1; i <= 7 && !plan; i++) {
    const key = addDays(chainedKey, i);
    if (dayPlan(sched, key).kind === 'plan') plan = planFast(sched, at(key, sched.usualStart).getTime());
  }

  if (plan && (!custom || plan.start + plan.hours * HOUR <= custom.start)) return plan;
  // Every day is a rest day: fall back to the plan so a fast still comes round.
  return custom ?? planFast(sched, chained);
}

/** With nothing logged yet: the most recent scheduled fast start at or before `now`. */
export function lastScheduledFast(sched: Schedule, now: Date): PlannedFast {
  const today = dateKey(now);
  for (let i = 0; i <= 7; i++) {
    const key = addDays(today, -i);
    // A custom fast and a plan start can't share a day, so at most one per day.
    const p = dayPlan(sched, key);
    if (p.kind === 'rest') continue;
    const start = at(key, p.kind === 'custom' ? p.start : sched.usualStart).getTime();
    if (start > now.getTime()) continue;
    return p.kind === 'custom' ? { start, hours: p.hours, dry: p.dry } : planFast(sched, start);
  }
  const start = at(today, sched.usualStart);
  if (start > now) start.setDate(start.getDate() - 1);
  return planFast(sched, start.getTime());
}

// ---------------------------------------------------------------- presets

const sunnahFast = (suhoor: ClockTime, iftar: ClockTime): DayPlan => ({
  kind: 'custom',
  start: suhoor,
  hours: hoursBetween(suhoor, iftar),
  dry: true,
});

/** Hours from one clock time to the next time the clock reads the other. */
export function hoursBetween(from: ClockTime, to: ClockTime): number {
  const mins = (t: ClockTime) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const diff = (mins(to) - mins(from) + 1440) % 1440 || 1440;
  return Math.round((diff / 60) * 100) / 100;
}

/** Sunnah fasts on Monday and Thursday; the other days keep your usual plan. */
export function sunnahPreset(suhoor: ClockTime = '05:00', iftar: ClockTime = '19:00'): DayPlan[] {
  return WEEKDAYS.map((_, i) => (i === 0 || i === 3 ? sunnahFast(suhoor, iftar) : { kind: 'plan' }));
}

/** Ramadan: a Suhoor-to-Iftar fast every day. */
export function ramadanPreset(suhoor: ClockTime = '05:00', iftar: ClockTime = '19:00'): DayPlan[] {
  return WEEKDAYS.map(() => sunnahFast(suhoor, iftar));
}

export function scheduleOf(s: Pick<Settings, 'plan' | 'windowStart' | 'week'>): Schedule {
  const eatingHours = EATING_HOURS[s.plan];
  return { eatingHours, usualStart: fastStartFromWindow(s.windowStart, eatingHours), week: s.week ?? everyDayPlan() };
}
