import { describe, expect, it } from 'vitest';
import { stageAt, stagesFor } from './stages';

describe('fasting stages', () => {
  it('shows only stages that begin before the fast ends', () => {
    expect(stagesFor(14).map((s) => s.hour)).toEqual([0, 3, 8, 12]);
    expect(stagesFor(16).map((s) => s.hour)).toEqual([0, 3, 8, 12, 14]);
    expect(stagesFor(20).map((s) => s.hour)).toEqual([0, 3, 8, 12, 14, 16, 18]);
  });

  it('finds the current and next stage', () => {
    expect(stageAt(0.5, 16)).toMatchObject({ current: { id: 'rising' }, next: { id: 'falling' } });
    expect(stageAt(8, 16)).toMatchObject({ current: { id: 'normal' }, next: { id: 'fat' } });
    expect(stageAt(13.9, 18)).toMatchObject({ current: { id: 'fat' }, next: { id: 'ketosis' } });
  });

  it('has no next stage near the end of a fast', () => {
    expect(stageAt(15, 16)).toMatchObject({ current: { id: 'ketosis' }, next: null });
  });

  it('keeps stages in time order', () => {
    const hours = stagesFor(24).map((s) => s.hour);
    expect([...hours].sort((a, b) => a - b)).toEqual(hours);
  });
});
