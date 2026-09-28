import { describe, expect, it } from 'vitest';
import { fastState, lastOccurrence, pastTime, upcomingTime } from './fasting';
import type { FastRecord } from './types';

const local = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);
const ms = (d: Date) => d.getTime();
const H = 3_600_000;

describe('fastState', () => {
  it('assumes a fast from your usual start when nothing is logged', () => {
    const s = fastState(local(29, 7), [], 8, '20:00');
    expect(s.phase).toBe('fasting');
    expect(s.start).toEqual(local(28, 20));
    expect(s.target).toEqual(local(29, 12));
    expect(s.fastId).toBeNull();
  });

  it('keeps counting past the target until you end it', () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(28, 20)) }];
    const s = fastState(local(29, 14, 30), fasts, 8, '20:00');
    expect(s.phase).toBe('fasting');
    expect(s.over).toBe(true);
    expect(s.remainingMs).toBe(0);
    expect(s.progress).toBe(1);
    expect(s.fastId).toBe('a');
  });

  it('times the eating window from when you ended the fast', () => {
    // 16:8 fast ended late, at 14:30 → eat until 22:30
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(28, 20)), end: ms(local(29, 14, 30)) }];
    const s = fastState(local(29, 15), fasts, 8, '20:00');
    expect(s.phase).toBe('eating');
    expect(s.start).toEqual(local(29, 14, 30));
    expect(s.end).toEqual(local(29, 22, 30));
    expect(s.remainingMs).toBe(7.5 * H);
  });

  it('works the same when a fast is ended early', () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(28, 20)), end: ms(local(29, 9)) }];
    const s = fastState(local(29, 10), fasts, 6, '20:00');
    expect(s.end).toEqual(local(29, 15));
  });

  it('starts the next fast when the eating window closes', () => {
    const fasts: FastRecord[] = [{ id: 'a', start: ms(local(28, 20)), end: ms(local(29, 14, 30)) }];
    const s = fastState(local(30, 1), fasts, 8, '20:00');
    expect(s.phase).toBe('fasting');
    expect(s.start).toEqual(local(29, 22, 30));
    expect(s.target).toEqual(local(30, 14, 30));
    expect(s.fastId).toBeNull();
  });

  it('honours a moved next-fast start', () => {
    const fasts: FastRecord[] = [
      { id: 'a', start: ms(local(28, 20)), end: ms(local(29, 12)), nextStart: ms(local(29, 23)) },
    ];
    expect(fastState(local(29, 21), fasts, 8, '20:00').phase).toBe('eating');
    expect(fastState(local(29, 23, 5), fasts, 8, '20:00').start).toEqual(local(29, 23));
  });

  it('uses the latest fast regardless of order', () => {
    const fasts: FastRecord[] = [
      { id: 'b', start: ms(local(29, 21)) },
      { id: 'a', start: ms(local(28, 20)), end: ms(local(29, 12)) },
    ];
    expect(fastState(local(30, 8), fasts, 8, '20:00')).toMatchObject({ phase: 'fasting', fastId: 'b' });
  });
});

describe('time helpers', () => {
  it('finds the last time the clock showed a time', () => {
    expect(lastOccurrence(local(29, 21), '20:00')).toEqual(local(29, 20));
    expect(lastOccurrence(local(29, 7), '20:00')).toEqual(local(28, 20));
  });

  it('reads a past clock time as today or yesterday', () => {
    expect(pastTime(local(29, 9), '08:15')).toEqual(local(29, 8, 15));
    expect(pastTime(local(29, 9), '21:00')).toEqual(local(28, 21));
  });

  it('reads an upcoming clock time as today or tomorrow', () => {
    expect(upcomingTime(local(29, 21), '23:00')).toEqual(local(29, 23));
    expect(upcomingTime(local(29, 21), '01:00')).toEqual(local(30, 1));
  });
});
