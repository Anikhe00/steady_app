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
  fasts: [{ id: 'f1', start: 1_790_000_000_000, end: 1_790_057_600_000 }],
};

describe('backup', () => {
  it('round-trips through JSON', () => {
    const file = JSON.parse(JSON.stringify(makeBackup(sample)));
    const r = readBackup(file);
    expect(r).toEqual({ ok: true, data: sample, photos: {} });
  });

  it('carries meal photos', () => {
    const withPhoto: AppData = {
      ...sample,
      meals: [{ id: 'm1', date: '2026-09-28', time: '13:00', description: '', type: 'lunch', portion: 'medium', fullness: 3, brokeFast: true, hasPhoto: true }],
    };
    const photos = { m1: 'data:image/jpeg;base64,AAAA' };
    const r = readBackup(JSON.parse(JSON.stringify(makeBackup(withPhoto, photos))));
    expect(r).toEqual({ ok: true, data: withPhoto, photos });
  });

  it('restores version 1 files that have no photos', () => {
    const v1 = { ...makeBackup(sample), version: 1, photos: undefined };
    expect(readBackup(JSON.parse(JSON.stringify(v1))).ok).toBe(true);
  });

  it('drops the photo flag when the file lacks the photo', () => {
    const withPhoto: AppData = {
      ...sample,
      meals: [{ id: 'm1', date: '2026-09-28', time: '13:00', description: 'x', type: 'lunch', portion: 'medium', fullness: 3, brokeFast: true, hasPhoto: true }],
    };
    const r = readBackup(JSON.parse(JSON.stringify(makeBackup(withPhoto))));
    expect(r.ok && r.data.meals[0].hasPhoto).toBeFalsy();
  });

  it('rejects photos that are not images', () => {
    const file = { ...makeBackup(sample), photos: { m1: 'javascript:alert(1)' } };
    expect(readBackup(file).ok).toBe(false);
  });

  it('restores older files without fasts as an empty list', () => {
    const { fasts: _, ...old } = makeBackup(sample);
    const r = readBackup(JSON.parse(JSON.stringify(old)));
    expect(r.ok && r.data.fasts).toEqual([]);
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
