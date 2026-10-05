import { describe, expect, it } from 'vitest';
import { dayCounted, streak } from './stats';
import type { AppData, DayLog } from './types';

const data = (days: DayLog[]): AppData => ({
  settings: {
    why: '',
    plan: '16:8',
    windowStart: '12:00',
    habits: [{ id: 'walk', label: 'Walk' }],
    unit: 'kg',
    remindersOn: false,
    startDate: '2026-09-28',
  },
  days: Object.fromEntries(days.map((d) => [d.date, d])),
  meals: [],
  slips: [],
  weighIns: [],
  fasts: [],
});
const kept = (date: string): DayLog => ({ date, keptFast: true, habitsDone: [] });

describe('filling in past days', () => {
  const today = '2026-10-05';

  it('a back-filled habit makes a missed day count', () => {
    const d = data([]);
    expect(dayCounted(d, '2026-10-03')).toBe(false);
    d.days['2026-10-03'] = { date: '2026-10-03', keptFast: false, habitsDone: ['walk'] };
    expect(dayCounted(d, '2026-10-03')).toBe(true);
  });

  it('filling in one of two missed days rejoins the streak', () => {
    // Sep 28 - Oct 1 counted, Oct 2 and 3 forgotten, Oct 4 and today counted.
    const d = data(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-04', today].map(kept));
    expect(streak(d, today).streak).toBe(2);

    d.days['2026-10-03'] = kept('2026-10-03');
    expect(streak(d, today).streak).toBe(7);
  });

  it('filling in yesterday clears the missed-yesterday warning', () => {
    const d = data([kept('2026-10-03')]);
    expect(streak(d, today).missedYesterday).toBe(true);
    d.days['2026-10-04'] = kept('2026-10-04');
    expect(streak(d, today)).toEqual({ streak: 2, missedYesterday: false });
  });

  it('unticking a past day can break the streak', () => {
    const d = data(['2026-10-02', '2026-10-03', '2026-10-04', today].map(kept));
    expect(streak(d, today).streak).toBe(4);
    d.days['2026-10-04'] = { ...kept('2026-10-04'), keptFast: false };
    d.days['2026-10-03'] = { ...kept('2026-10-03'), keptFast: false };
    expect(streak(d, today).streak).toBe(1);
  });
});
