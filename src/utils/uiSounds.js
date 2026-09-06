const HOVER_SRC = './assets/sounds/btn_hover.ogg';
const CLICK_SRC = './assets/sounds/btn_click.ogg';

let hoverAudio = null;
let clickAudio = null;
let unlocked = false;

function ensureAudio() {
  if (!hoverAudio) {
    hoverAudio = new Audio(HOVER_SRC);
    hoverAudio.volume = 0.35;
    hoverAudio.preload = 'auto';
  }
  if (!clickAudio) {
    clickAudio = new Audio(CLICK_SRC);
    clickAudio.volume = 0.45;
    clickAudio.preload = 'auto';
  }
}

function play(kind) {
  try {
    ensureAudio();
    const base = kind === 'hover' ? hoverAudio : clickAudio;
    if (!base) return;
    const a = base.cloneNode();
    a.volume = base.volume;
    const p = a.play();
    if (p?.catch) p.catch(() => {});
  } catch {}
}

export function unlockUiSounds() {
  if (unlocked) return;
  unlocked = true;
  ensureAudio();
}

export function playBtnHover() {
  if (!unlocked) return;
  play('hover');
}

export function playBtnClick() {
  unlockUiSounds();
  play('click');
}

/** Делегирование на все кнопки / кликабельные контролы */
export function bindUiSounds(root = document) {
  if (!root || root.__sfUiSoundsBound) return () => {};
  root.__sfUiSoundsBound = true;

  const isInteractive = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.getAttribute?.('aria-disabled') === 'true') return false;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A') return true;
    if (el.getAttribute('role') === 'button') return true;
    if (el.classList?.contains('topic-btn')) return true;
    if (el.classList?.contains('title-link')) return true;
    if (el.classList?.contains('holonet-slide')) return true;
    if (el.classList?.contains('holonet-thumb')) return true;
    if (el.classList?.contains('holonet-dot')) return true;
    if (el.classList?.contains('holonet-rail-item')) return true;
    if (el.classList?.contains('win-btn')) return true;
    if (el.classList?.contains('btn-save')) return true;
    if (el.classList?.contains('btn-ghost-sm')) return true;
    if (el.classList?.contains('link-btn')) return true;
    return false;
  };

  const findTarget = (node) => {
    let el = node;
    while (el && el !== root) {
      if (isInteractive(el)) return el;
      el = el.parentElement;
    }
    return null;
  };

  const onOver = (e) => {
    const t = findTarget(e.target);
    if (!t || t.__sfHoverArmed) return;
    t.__sfHoverArmed = true;
    playBtnHover();
  };
  const onOut = (e) => {
    const t = findTarget(e.target);
    if (!t) return;
    const to = e.relatedTarget;
    if (to && t.contains(to)) return;
    t.__sfHoverArmed = false;
  };
  const onDown = (e) => {
    if (findTarget(e.target)) playBtnClick();
  };
  const unlock = () => unlockUiSounds();

  root.addEventListener('pointerover', onOver, true);
  root.addEventListener('pointerout', onOut, true);
  root.addEventListener('pointerdown', onDown, true);
  root.addEventListener('pointerdown', unlock, { once: true, capture: true });

  return () => {
    root.removeEventListener('pointerover', onOver, true);
    root.removeEventListener('pointerout', onOut, true);
    root.removeEventListener('pointerdown', onDown, true);
    delete root.__sfUiSoundsBound;
  };
}
