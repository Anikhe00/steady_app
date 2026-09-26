import { describe, expect, it } from 'vitest';
import { makeBackup, readBackup } from './backup';
import type { AppData } from './types';

const sample: AppData = {
  settings: {
    why: 'Keep up with my kids',
    plan: '16:8',
    windowStart: '12:00',
    habits: [{ id: 'a', label: 'Walk 20 min' }],
    unit: 'kg',
    remindersOn: false,
    startDate: '2026-09-28',
  },
  days: { '2026-09-28': { date: '2026-09-28', keptFast: true, habitsDone: ['a'] } },
  meals: [],
  slips: [{ id: 's1', date: '2026-09-28', time: '21:00', trigger: 'stress' }],
  weighIns: [{ id: 'w1', date: '2026-09-28', kg: 80.2 }],
};

describe('backup', () => {
  it('round-trips through JSON', () => {
    const file = JSON.parse(JSON.stringify(makeBackup(sample)));
    const r = readBackup(file);
    expect(r).toEqual({ ok: true, data: sample });
  });

  it('rejects files that are not Steady backups', () => {
    expect(readBackup({ hello: 1 }).ok).toBe(false);
    expect(readBackup(null).ok).toBe(false);
  });

  it('rejects damaged entries', () => {
    const file = { ...makeBackup(sample), weighIns: [{ id: 'x', date: 'soon', kg: 1 }] };
    expect(readBackup(file).ok).toBe(false);
  });
});
