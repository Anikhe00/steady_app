import { at, dateKey, addDays, parseClock, type FastingStatus } from './dates';
import type { ClockTime, FastRecord } from './types';

// Fasts are driven by you: a fast only ends when you end it. The eating
// window then runs from that moment for the plan's eating hours, and the next
// fast starts when that window closes (or earlier, if you start it yourself).
// A fast that starts because the window closed isn't saved until you end or
// edit it; it's derived from the last fast you ended.

const HOUR = 3_600_000;

export interface FastState extends FastingStatus {
  /** Fasting: past the plan's target length. */
  over: boolean;
  /** Fasting: the planned end (start + fasting hours). */
  target: Date;
  /** The saved fast this state belongs to: the running fast, or the one just ended. */
  fastId: string | null;
}

/** The most recent time the clock read `t`, at or before `now`. */
export function lastOccurrence(now: Date, t: ClockTime): Date {
  const today = at(dateKey(now), t);
  return today <= now ? today : at(addDays(dateKey(now), -1), t);
}

export function latestFast(fasts: FastRecord[]): FastRecord | null {
  return fasts.reduce<FastRecord | null>((a, b) => (!a || b.start > a.start ? b : a), null);
}

/** When the eating window after an ended fast closes, i.e. when the next fast starts. */
export function nextFastStart(f: FastRecord, eatingHours: number): number {
  return f.nextStart ?? f.end! + eatingHours * HOUR;
}

export function fastState(
  now: Date,
  fasts: FastRecord[],
  eatingHours: number,
  usualFastStart: ClockTime,
): FastState {
  const fastingMs = (24 - eatingHours) * HOUR;
  const t = now.getTime();
  const last = latestFast(fasts);

  const fasting = (start: number, fastId: string | null): FastState => {
    const target = start + fastingMs;
    return {
      phase: 'fasting',
      start: new Date(start),
      end: new Date(target),
      target: new Date(target),
      remainingMs: Math.max(0, target - t),
      progress: Math.min(1, Math.max(0, (t - start) / fastingMs)),
      over: t >= target,
      windowDay: dateKey(new Date(target)),
      fastId,
    };
  };

  // Nothing logged yet: assume the fast began at your usual start time.
  if (!last) return fasting(lastOccurrence(now, usualFastStart).getTime(), null);
  if (last.end === undefined) return fasting(last.start, last.id);

  const close = nextFastStart(last, eatingHours);
  if (t < close) {
    const total = Math.max(1, close - last.end);
    return {
      phase: 'eating',
      start: new Date(last.end),
      end: new Date(close),
      target: new Date(close),
      remainingMs: close - t,
      progress: Math.min(1, Math.max(0, (t - last.end) / total)),
      over: false,
      windowDay: dateKey(new Date(last.end)),
      fastId: last.id,
    };
  }
  // The eating window closed, so the next fast is under way.
  return fasting(close, null);
}

/** Minutes → "HH:MM", for pre-filling time inputs. */
export function toClock(d: Date): ClockTime {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
