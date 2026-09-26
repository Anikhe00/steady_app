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

/**
 * Where "now" sits relative to the eating windows. Each day has one window
 * that opens at `startFor(day)` and lasts `eatingHours`; a window may run past
 * midnight (e.g. 18:00 + 8h closes at 02:00), so yesterday's window is checked
 * too.
 */
export function fastingStatus(
  now: Date,
  eatingHours: number,
  startFor: (day: DateKey) => ClockTime,
): FastingStatus {
  const today = dateKey(now);
  const windowOf = (day: DateKey) => {
    const open = at(day, startFor(day));
    return { day, open, close: new Date(open.getTime() + eatingHours * 3_600_000) };
  };
  const yesterday = windowOf(addDays(today, -1));
  const current = windowOf(today);
  const tomorrow = windowOf(addDays(today, 1));

  const build = (phase: FastingPhase, start: Date, end: Date, windowDay: DateKey): FastingStatus => {
    const total = Math.max(1, end.getTime() - start.getTime());
    const elapsed = now.getTime() - start.getTime();
    return {
      phase,
      start,
      end,
      remainingMs: Math.max(0, end.getTime() - now.getTime()),
      progress: Math.min(1, Math.max(0, elapsed / total)),
      windowDay,
    };
  };

  if (now >= yesterday.open && now < yesterday.close) {
    return build('eating', yesterday.open, yesterday.close, yesterday.day);
  }
  if (now < current.open) {
    const from = yesterday.close < current.open ? yesterday.close : at(today, '00:00');
    return build('fasting', from, current.open, today);
  }
  if (now < current.close) {
    return build('eating', current.open, current.close, today);
  }
  return build('fasting', current.close, tomorrow.open, tomorrow.day);
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
 * `startDate` are not part of the history.
 */
export function neverMissTwiceStreak(
  counted: (day: DateKey) => boolean,
  today: DateKey,
  startDate: DateKey,
): StreakResult {
  let streak = counted(today) ? 1 : 0;
  let misses = 0;
  let day = addDays(today, -1);
  const missedYesterday = day >= startDate && !counted(day);

  while (day >= startDate) {
    if (counted(day)) {
      streak++;
      misses = 0;
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
