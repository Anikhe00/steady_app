// What is roughly happening in the body during a fast, by hours since the
// last meal. Timings vary a lot from person to person (last meal, activity,
// sleep), so the copy stays approximate and never promises results.

export interface FastStage {
  id: string;
  hour: number;
  icon: string;
  title: string;
  summary: string;
  detail: string;
  tip: string;
}

export const STAGES: FastStage[] = [
  {
    id: 'rising',
    hour: 0,
    icon: '🍽️',
    title: 'Blood sugar rises',
    summary: 'Your body is digesting your last meal.',
    detail:
      'Food is being broken down and glucose enters your blood. Insulin rises to move that glucose into your cells for energy and to store the rest.',
    tip: 'Finishing your last meal with protein and fibre helps you feel full for longer into the fast.',
  },
  {
    id: 'falling',
    hour: 3,
    icon: '📉',
    title: 'Blood sugar falls',
    summary: 'Insulin is dropping as digestion winds down.',
    detail:
      'With no new food coming in, blood sugar and insulin start to come down. This is when the first hunger pangs can show up, and they usually pass in 15 to 20 minutes.',
    tip: 'A glass of water or a cup of plain tea can ride out a hunger wave.',
  },
  {
    id: 'normal',
    hour: 8,
    icon: '🩸',
    title: 'Blood sugar back to normal',
    summary: 'Your body switches to its stored sugar.',
    detail:
      'Blood sugar has settled back to its baseline. Your liver releases stored glucose (glycogen) to keep your energy steady between meals.',
    tip: "If you're sleeping through this stage, you're doing most of the work without noticing.",
  },
  {
    id: 'fat',
    hour: 12,
    icon: '🔥',
    title: 'Fat burning ramps up',
    summary: 'Stored sugar runs low, so your body turns to fat.',
    detail:
      'As glycogen stores get used up, your body burns more fat for fuel. Insulin is low, which makes it easier to release stored fat.',
    tip: 'Light movement, like a short walk, fits well here.',
  },
  {
    id: 'ketosis',
    hour: 14,
    icon: '⚡',
    title: 'Early ketosis',
    summary: 'Your liver starts making ketones from fat.',
    detail:
      'Ketones are an alternative fuel your brain and muscles can use. Some people notice steadier energy and fewer cravings once ketone levels begin to rise.',
    tip: 'Keep drinking water. A pinch of salt in water can help if you feel light-headed.',
  },
  {
    id: 'growth',
    hour: 16,
    icon: '💪',
    title: 'Growth hormone rises',
    summary: 'Hormones shift to protect muscle while you burn fat.',
    detail:
      'Growth hormone levels tend to climb during longer fasts, which helps preserve muscle while fat is used for fuel.',
    tip: 'Break your fast with protein to make the most of this stage.',
  },
  {
    id: 'autophagy',
    hour: 18,
    icon: '♻️',
    title: 'Cell clean-up begins',
    summary: 'Autophagy, your cells recycling old parts, may start increasing.',
    detail:
      "Autophagy is the body's way of breaking down and recycling worn-out parts of cells. Research suggests longer fasts increase it, though exactly when it starts in people is still being studied.",
    tip: "If you feel unwell at any point, it's fine to eat. Recovering from a stop is part of the plan.",
  },
  {
    id: 'deep',
    hour: 20,
    icon: '🌟',
    title: 'Deeper ketosis',
    summary: 'Ketones keep rising as fat becomes your main fuel.',
    detail: 'By now most of your energy comes from fat and ketones. Hunger often feels calmer than it did earlier in the fast.',
    tip: 'Plan a gentle, balanced first meal instead of a large one.',
  },
];

/**
 * Stages that start before this fast ends. A stage landing exactly on the end
 * is left out: on a ring it would sit on top of the start marker.
 */
export function stagesFor(fastHours: number): FastStage[] {
  return STAGES.filter((s) => s.hour < fastHours);
}

/** The latest stage reached after `elapsedHours`, and the next one if the fast is long enough. */
export function stageAt(elapsedHours: number, fastHours: number): { current: FastStage; next: FastStage | null } {
  const stages = stagesFor(fastHours);
  let i = 0;
  while (i + 1 < stages.length && stages[i + 1].hour <= elapsedHours) i++;
  return { current: stages[i], next: stages[i + 1] ?? null };
}
