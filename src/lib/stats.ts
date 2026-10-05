import { addDays, neverMissTwiceStreak, rollingAverage, weekOf, type Point } from './dates';
import { isRestDay } from './schedule';
import type { AppData, DateKey, SlipTrigger } from './types';

export type DayTone = 'all' | 'some' | 'none' | 'rest' | 'pending' | 'outside';

/** A day counts towards the streak if the fast was kept or any habit was done. */
export function dayCounted(d: AppData, date: DateKey): boolean {
  const log = d.days[date];
  if (!log) return false;
  const habitIds = new Set(d.settings?.habits.map((h) => h.id) ?? []);
  return log.keptFast || log.habitsDone.some((id) => habitIds.has(id));
}

/** Tile colour: everything done (fast + every habit), some of it, or none. */
export function dayTone(d: AppData, date: DateKey, today: DateKey): DayTone {
  const s = d.settings;
  if (!s || date < s.startDate || date > today) return 'outside';
  const log = d.days[date];
  const habits = s.habits.map((h) => h.id);
  const done = (log?.keptFast ? 1 : 0) + habits.filter((id) => log?.habitsDone.includes(id)).length;
  if (done === habits.length + 1) return 'all';
  if (done > 0) return 'some';
  if (date === today) return 'pending';
  return isRestDay(s.week, date) ? 'rest' : 'none';
}

export function streak(d: AppData, today: DateKey) {
  const start = d.settings?.startDate ?? today;
  return neverMissTwiceStreak((date) => dayCounted(d, date), today, start, (date) => isRestDay(d.settings?.week, date));
}

export function weekSummary(d: AppData, today: DateKey) {
  const week = weekOf(today);
  const inWeek = (date: DateKey) => date >= week[0] && date <= week[6];
  const meals = d.meals.filter((m) => inWeek(m.date));
  const fasts = week.filter((date) => date <= today && d.days[date]?.keptFast).length;
  const avgFullness = meals.length ? meals.reduce((a, m) => a + m.fullness, 0) / meals.length : null;
  return { week, fasts, mealCount: meals.length, avgFullness };
}

export function topTriggers(d: AppData, today: DateKey, days = 30) {
  const from = addDays(today, -(days - 1));
  const counts = new Map<SlipTrigger, number>();
  for (const s of d.slips) {
    if (s.date >= from && s.date <= today) counts.set(s.trigger, (counts.get(s.trigger) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function weightSeries(d: AppData): { raw: Point[]; avg: Point[] } {
  const raw = [...d.weighIns]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({ date: w.date, value: w.kg }));
  return { raw, avg: rollingAverage(raw) };
}

export const KG_PER_LB = 0.45359237;
export const toDisplay = (kg: number, unit: 'kg' | 'lb') => (unit === 'kg' ? kg : kg / KG_PER_LB);
export const fromDisplay = (v: number, unit: 'kg' | 'lb') => (unit === 'kg' ? v : v * KG_PER_LB);
