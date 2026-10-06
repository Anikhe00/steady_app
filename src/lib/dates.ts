import type { ClockTime, DateKey } from './types';

// All date logic works in the phone's local time. Days are "YYYY-MM-DD" keys
// so they survive JSON backups and never drift with time zones.

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** True for a real calendar date written as "YYYY-MM-DD" (so not "2026-02-30"). */
export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(parseKey(s)) === s;
}

/**
 * The day a "#/today/<date>" link opens for logging. Past days can be filled
 * in back to the day tracking started; the future can't be logged, and
 * anything unreadable falls back to today.
 */
export function logDay(requested: string | undefined, today: DateKey, startDate: DateKey): DateKey {
  if (!requested || !isDateKey(requested) || requested >= today) return today;
  return requested < startDate && startDate <= today ? startDate : requested;
}

export function clockTime(d: Date): ClockTime {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseClock(t: ClockTime): { h: number; m: number } {
  const [h, m] = t.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

/** The Date for a clock time on a given local day. */
export function at(key: DateKey, t: ClockTime): Date {
  const d = parseKey(key);
  const { h, m } = parseClock(t);
  d.setHours(h, m, 0, 0);
  return d;
}

// ---------------------------------------------------------------- fasting

/** A clock time moved by some hours, wrapping around midnight. */
export function addClock(t: ClockTime, hours: number): ClockTime {
  const { h, m } = parseClock(t);
  const mins = (((h * 60 + m + Math.round(hours * 60)) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export interface DailySchedule {
  fastStart: ClockTime;
  /** The fast ends when the eating window opens. */
  fastEnd: ClockTime;
  windowClose: ClockTime;
  /** Same clock time as fastStart: the day repeats every 24h. */
  nextFastStart: ClockTime;
  fastingHours: number;
}

/** The whole day's plan from the time the fast starts. */
export function scheduleFromFastStart(fastStart: ClockTime, eatingHours: number): DailySchedule {
  const fastingHours = 24 - eatingHours;
  const fastEnd = addClock(fastStart, fastingHours);
  return { fastStart, fastEnd, windowClose: addClock(fastEnd, eatingHours), nextFastStart: fastStart, fastingHours };
}

/** The stored eating-window start implies when the fast starts. */
export const fastStartFromWindow = (windowStart: ClockTime, eatingHours: number) => addClock(windowStart, eatingHours);

export type FastingPhase = 'fasting' | 'eating';

export interface FastingStatus {
  phase: FastingPhase;
  /** When the current phase began and when it ends. */
  start: Date;
  end: Date;
  remainingMs: number;
  /** 0..1 through the current phase. */
  progress: number;
  /** The day whose eating window this phase belongs to (eating), or leads up to (fasting). */
  windowDay: DateKey;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${pad(m)}m`;
}

// ---------------------------------------------------------------- streaks

export interface StreakResult {
  /** Days that counted in the current run. */
  streak: number;
  /** Yesterday was a miss: one more miss breaks the streak. */
  missedYesterday: boolean;
}

/**
 * "Never miss twice": walk back from today counting days that counted.
 * A single missed day is forgiven; two misses in a row end the run.
 * Today never counts as a miss (it isn't over yet), and days before
 * `startDate` are not part of the history. A rest day that didn't count is
 * skipped: it neither adds to the run nor counts as a miss.
 */
export function neverMissTwiceStreak(
  counted: (day: DateKey) => boolean,
  today: DateKey,
  startDate: DateKey,
  rest: (day: DateKey) => boolean = () => false,
): StreakResult {
  let streak = counted(today) ? 1 : 0;
  let misses = 0;
  let day = addDays(today, -1);
  const missedYesterday = day >= startDate && !counted(day) && !rest(day);

  while (day >= startDate) {
    if (counted(day)) {
      streak++;
      misses = 0;
    } else if (rest(day)) {
      // Neutral: carries on to the day before.
    } else {
      misses++;
      if (misses >= 2) break;
    }
    day = addDays(day, -1);
  }
  return { streak, missedYesterday };
}

// ---------------------------------------------------------------- weight

export interface Point {
  date: DateKey;
  value: number;
}

/**
 * 7-day rolling average: for each day with a weigh-in, the mean of every
 * weigh-in day in the trailing window ending that day. Multiple weigh-ins on
 * one day collapse to that day's last entry.
 */
export function rollingAverage(points: Point[], windowDays = 7): Point[] {
  const byDay = new Map<DateKey, number>();
  for (const p of points) byDay.set(p.date, p.value);
  const days = [...byDay.keys()].sort();

  return days.map((day) => {
    const from = addDays(day, -(windowDays - 1));
    const inWindow = days.filter((d) => d >= from && d <= day).map((d) => byDay.get(d)!);
    const avg = inWindow.reduce((a, b) => a + b, 0) / inWindow.length;
    return { date: day, value: avg };
  });
}

/** Monday-first list of the 7 dates in the week containing `key`. */
export function weekOf(key: DateKey): DateKey[] {
  const d = parseKey(key);
  const offset = (d.getDay() + 6) % 7;
  const monday = addDays(key, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
