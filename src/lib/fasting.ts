import { at, dateKey, addDays, parseClock, type FastingStatus } from './dates';
import { everyDayPlan, goalFor, lastScheduledFast, nextFastAfter, scheduleOf, type PlannedFast, type Schedule } from './schedule';
import type { ClockTime, DayPlan, FastRecord, Settings } from './types';

// Fasts are driven by you: a fast only ends when you end it. The eating
// window then runs from that moment for the plan's eating hours, and the next
// fast starts when that window closes (or earlier, if you start it yourself).
// The weekly schedule (./schedule) can move that start and set the goal.
// A fast that starts because the window closed isn't saved until you end or
// edit it; it's derived from the last fast you ended.

const HOUR = 3_600_000;

export interface FastState extends FastingStatus {
  /** Fasting: past the goal. */
  over: boolean;
  /** Fasting: the goal end (start + goal hours). Eating: when the next fast starts. */
  target: Date;
  /** The saved fast this state belongs to: the running fast, or the one just ended. */
  fastId: string | null;
  /** The goal of the running fast, or (eating) of the next one. */
  goalHours: number;
  /** That fast is dry: no food or water. */
  dry: boolean;
}

/** The most recent time the clock read `t`, at or before `now`. */
export function lastOccurrence(now: Date, t: ClockTime): Date {
  const today = at(dateKey(now), t);
  return today <= now ? today : at(addDays(dateKey(now), -1), t);
}

export function latestFast(fasts: FastRecord[]): FastRecord | null {
  return fasts.reduce<FastRecord | null>((a, b) => (!a || b.start > a.start ? b : a), null);
}

/** The next fast after an ended one: where you moved it, or what the schedule says. */
export function nextFast(f: FastRecord, sched: Schedule): PlannedFast {
  if (f.nextStart !== undefined) return { start: f.nextStart, ...goalFor(sched, f.nextStart) };
  return nextFastAfter(sched, f.end!);
}

/** A saved fast's goal: the one it started with, or its day's goal for older records. */
export function goalOf(f: FastRecord, sched: Schedule): { hours: number; dry: boolean } {
  return f.goalHours !== undefined ? { hours: f.goalHours, dry: !!f.dry } : goalFor(sched, f.start);
}

export function fastState(
  now: Date,
  fasts: FastRecord[],
  eatingHours: number,
  usualFastStart: ClockTime,
  week: DayPlan[] = everyDayPlan(),
): FastState {
  const sched: Schedule = { eatingHours, usualStart: usualFastStart, week };
  const t = now.getTime();
  const last = latestFast(fasts);

  const fasting = (start: number, fastId: string | null, goal: { hours: number; dry: boolean }): FastState => {
    const target = start + goal.hours * HOUR;
    return {
      phase: 'fasting',
      start: new Date(start),
      end: new Date(target),
      target: new Date(target),
      remainingMs: Math.max(0, target - t),
      progress: Math.min(1, Math.max(0, (t - start) / (goal.hours * HOUR))),
      over: t >= target,
      windowDay: dateKey(new Date(target)),
      fastId,
      goalHours: goal.hours,
      dry: goal.dry,
    };
  };

  const eating = (opened: number, close: number, fastId: string, next: { hours: number; dry: boolean }): FastState => {
    const total = Math.max(1, close - opened);
    return {
      phase: 'eating',
      start: new Date(opened),
      end: new Date(close),
      target: new Date(close),
      remainingMs: close - t,
      progress: Math.min(1, Math.max(0, (t - opened) / total)),
      over: false,
      windowDay: dateKey(new Date(opened)),
      fastId,
      goalHours: next.hours,
      dry: next.dry,
    };
  };

  // Nothing logged yet: assume the fast began at the last scheduled start.
  if (!last) {
    const f = lastScheduledFast(sched, now);
    return fasting(f.start, null, f);
  }
  if (last.end === undefined) {
    if (last.start <= t) return fasting(last.start, last.id, goalOf(last, sched));
    // A fast set to start later: you're still in your eating window until then.
    const prev = latestFast(fasts.filter((f) => f.id !== last.id && f.end !== undefined));
    return eating(Math.min(prev?.end ?? t, t), last.start, last.id, goalOf(last, sched));
  }

  const next = nextFast(last, sched);
  if (t < next.start) return eating(last.end, next.start, last.id, next);
  // The eating window closed, so the next fast is under way.
  return fasting(next.start, null, next);
}

/** The fasting state for saved settings. */
export const fastStateFor = (s: Settings, fasts: FastRecord[], now = new Date()): FastState => {
  const sched = scheduleOf(s);
  return fastState(now, fasts, sched.eatingHours, sched.usualStart, sched.week);
};

/** Minutes → "HH:MM", for pre-filling time inputs. */
export function toClock(d: Date): ClockTime {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * A clock time read as the occurrence closest to `now` (yesterday, today or
 * tomorrow), so "17:24" at 16:32 means today, and "23:00" at 01:00 means
 * last night.
 */
export function nearestTime(now: Date, t: ClockTime): Date {
  const { h, m } = parseClock(t);
  const candidates = [-1, 0, 1].map((dd) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dd);
    d.setHours(h, m, 0, 0);
    return d;
  });
  return candidates.reduce((a, b) => (Math.abs(b.getTime() - now.getTime()) < Math.abs(a.getTime() - now.getTime()) ? b : a));
}

/**
 * A clock time entered for an event that already happened: today if that's
 * not in the future, otherwise yesterday. Keeps time pickers simple.
 */
export function pastTime(now: Date, t: ClockTime): Date {
  const { h, m } = parseClock(t);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

/** A clock time for something coming up: the next time the clock reads t, from `from`. */
export function upcomingTime(from: Date, t: ClockTime): Date {
  const { h, m } = parseClock(t);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d < from) d.setDate(d.getDate() + 1);
  return d;
}
