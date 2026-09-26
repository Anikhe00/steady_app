// Bottom sheet built on <dialog>: focus trapping, Esc to close and the
// backdrop come from the platform.

export interface SheetHandle {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  close: () => void;
}

export function openSheet(title: string, bodyHtml: string, onClose?: () => void): SheetHandle {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.setAttribute('aria-labelledby', 'sheet-title');
  dialog.innerHTML = `
    <div class="sheet-inner">
      <header class="sheet-head">
        <h2 id="sheet-title">${title}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </header>
      <div class="sheet-body">${bodyHtml}</div>
    </div>`;
  document.body.append(dialog);

  const close = () => dialog.close();
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || (e.target as HTMLElement).closest('[data-close]')) close();
  });
  dialog.showModal();
  return { dialog, body: dialog.querySelector('.sheet-body')!, close };
}

/** A small confirm sheet. Resolves true when the user confirms. */
export function confirmSheet(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const s = openSheet(
      title,
      `<p class="muted">${message}</p>
       <div class="row gap">
         <button type="button" class="btn ghost grow" data-close>Cancel</button>
         <button type="button" class="btn grow ${danger ? 'danger' : 'primary'}" data-ok>${confirmLabel}</button>
       </div>`,
      () => resolve(ok),
    );
    s.body.querySelector('[data-ok]')!.addEventListener('click', () => {
      ok = true;
      s.close();
    });
  });
}

let toastTimer: number | undefined;
export function toast(message: string, tone: 'ok' | 'info' = 'ok'): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 3200);
}
