import * as db from '../lib/db';
import { addDays, dateKey } from '../lib/dates';
import { TRIGGER_LABELS } from '../lib/types';
import { esc, formatClock, formatDay, onAction } from '../ui/dom';
import { openMealSheet } from '../ui/forms';
import { confirmSheet, toast } from '../ui/sheet';

let selected: string | null = null;

const FULL_LABEL = ['', 'Still hungry', 'Light', 'Satisfied', 'Full', 'Stuffed'];

export function renderFood(root: HTMLElement): void {
  const today = dateKey(new Date());
  const start = db.data.settings!.startDate;
  const day = selected && selected <= today ? selected : today;
  const meals = db.data.meals.filter((m) => m.date === day).sort((a, b) => a.time.localeCompare(b.time));
  const slips = db.data.slips.filter((s) => s.date === day).sort((a, b) => a.time.localeCompare(b.time));
  const earliest = [start, ...db.data.meals.map((m) => m.date)].sort()[0];
  const label = day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' });

  root.innerHTML = `
    <header class="screen-head">
      <p class="eyebrow">Food log</p>
      <h1>What I ate</h1>
    </header>

    <nav class="day-nav" aria-label="Choose day">
      <button class="icon-btn" data-action="prev" aria-label="Previous day" ${day <= earliest ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <label class="day-pick">
        <span class="day-label">${esc(label)}</span>
        <input type="date" data-date value="${day}" max="${today}" aria-label="Pick a day">
      </label>
      <button class="icon-btn" data-action="next" aria-label="Next day" ${day >= today ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
      </button>
    </nav>

    <button class="btn primary block" data-action="add">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      Log a meal${day === today ? '' : ' for this day'}
    </button>

    ${
      meals.length
        ? `<ul class="entries" aria-label="Meals">${meals
            .map(
              (m) => `<li class="entry">
                <div class="entry-main">
                  <p class="entry-meta">${esc(formatClock(m.time))} · ${esc(m.type)}${m.brokeFast ? ' · <span class="tag">broke fast</span>' : ''}</p>
                  <p class="entry-title">${esc(m.description)}</p>
                  <p class="muted small">${esc(m.portion)} portion · fullness ${m.fullness}/5, ${esc(FULL_LABEL[m.fullness])}</p>
                </div>
                <button class="icon-btn" data-action="del-meal" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.description)}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>
                </button>
              </li>`,
            )
            .join('')}</ul>`
        : `<p class="empty">No meals logged ${day === today ? 'yet today' : 'on this day'}.</p>`
    }

    ${
      slips.length
        ? `<h2 class="section-title">Slips</h2>
          <ul class="entries" aria-label="Slips">${slips
            .map(
              (s) => `<li class="entry slip-entry">
                <div class="entry-main">
                  <p class="entry-meta">${esc(formatClock(s.time))}</p>
                  <p class="entry-title">${esc(TRIGGER_LABELS[s.trigger])}</p>
                  ${s.note ? `<p class="muted small">${esc(s.note)}</p>` : ''}
                </div>
                <button class="icon-btn" data-action="del-slip" data-id="${esc(s.id)}" aria-label="Delete slip">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>
                </button>
              </li>`,
            )
            .join('')}</ul>`
        : ''
    }
  `;

  const go = (d: string) => {
    selected = d > today ? today : d;
    window.dispatchEvent(new Event('steady:rerender'));
  };

  onAction(root, {
    prev: () => go(addDays(day, -1)),
    next: () => go(addDays(day, 1)),
    add: () => openMealSheet(day),
    'del-meal': async (el) => {
      if (await confirmSheet('Delete meal?', 'This removes it from your log.', 'Delete', true)) {
        await db.deleteMeal(el.dataset.id!);
        toast('Meal deleted');
      }
    },
    'del-slip': async (el) => {
      if (await confirmSheet('Delete slip?', 'This removes it from your log.', 'Delete', true)) {
        await db.deleteSlip(el.dataset.id!);
        toast('Slip deleted');
      }
    },
  });

  root.querySelector<HTMLInputElement>('[data-date]')!.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (v) go(v);
  });
}
