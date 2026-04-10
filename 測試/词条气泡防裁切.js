const ROOT_WINDOW = window.parent || window;
const ROOT_DOCUMENT = ROOT_WINDOW.document;
const ROOT_JQUERY = ROOT_WINDOW.$ || window.$;
const BOX_SELECTOR = '.wbox, .abox, .jbox, .custom-wbox, .custom-abox, .custom-jbox';
const POP_SELECTOR = '.wpop, .apop, .jpop, .custom-wpop, .custom-apop, .custom-jpop';
const VIEWPORT_MARGIN = 8;
const GAP = 6;

let activePopupState = null;
let rafId = 0;
let observer = null;
function getBoxCount() {
  return ROOT_DOCUMENT.querySelectorAll(BOX_SELECTOR).length;
}

function logBoxCount(reason) {
  console.info(`[词条气泡防裁切] ${reason}，当前词条数量:`, getBoxCount());
}

function getPopupFromBox(box) {
  return box ? box.querySelector(POP_SELECTOR) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const CAPTURE_PROPS = [
  'background',
  'backgroundColor',
  'backgroundImage',
  'backdropFilter',
  'webkitBackdropFilter',
  'border',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
  'borderRadius',
  'boxShadow',
  'color',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'minWidth',
  'maxWidth',
  'maxHeight',
  'overflowY',
];

function captureStyle(pop) {
  const computed = ROOT_WINDOW.getComputedStyle(pop);
  const result = {};
  for (const prop of CAPTURE_PROPS) {
    result[prop] = computed[prop];
  }
  return result;
}

function applyFloatingStyle(pop, captured) {
  pop.style.position = 'fixed';
  pop.style.display = 'block';
  pop.style.left = '0px';
  pop.style.top = '0px';
  pop.style.right = 'auto';
  pop.style.bottom = 'auto';
  pop.style.margin = '0';
  pop.style.zIndex = '2147483647';
  pop.style.pointerEvents = 'auto';
  pop.style.opacity = '1';
  if (captured) {
    for (const prop of CAPTURE_PROPS) {
      pop.style[prop] = captured[prop];
    }
  }
}

function clearFloatingStyle(pop) {
  pop.style.position = '';
  pop.style.display = 'none';
  pop.style.left = '';
  pop.style.top = '';
  pop.style.right = '';
  pop.style.bottom = '';
  pop.style.margin = '';
  pop.style.zIndex = '';
  pop.style.pointerEvents = '';
  pop.style.opacity = '';
  if (typeof CAPTURE_PROPS !== 'undefined') {
    for (const prop of CAPTURE_PROPS) {
      pop.style[prop] = '';
    }
  }
}

function placePopup(trigger, pop) {
  const triggerRect = trigger.getBoundingClientRect();
  const viewportWidth = ROOT_WINDOW.innerWidth;
  const viewportHeight = ROOT_WINDOW.innerHeight;
  const popupWidth = pop.offsetWidth;
  const popupHeight = pop.offsetHeight;
  const left = clamp(triggerRect.left, VIEWPORT_MARGIN, viewportWidth - popupWidth - VIEWPORT_MARGIN);

  let top = triggerRect.top - popupHeight - GAP;
  if (top < VIEWPORT_MARGIN) {
    top = triggerRect.bottom + GAP;
    if (top + popupHeight > viewportHeight - VIEWPORT_MARGIN) {
      top = clamp(viewportHeight - popupHeight - VIEWPORT_MARGIN, VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN);
    }
  }

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function closeActivePopup() {
  if (!activePopupState) return;

  const { box, popup, parent, nextSibling } = activePopupState;
  clearFloatingStyle(popup);

  if (parent && parent.isConnected) {
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(popup, nextSibling);
    } else {
      parent.appendChild(popup);
    }
  }

  if (box && box.classList) {
    box.classList.remove('thp-open');
  }

  activePopupState = null;
}

function openPopupForBox(box) {
  if (!box) return;

  const popup = getPopupFromBox(box);
  if (!popup) {
    console.warn('[词条气泡防裁切] 未找到气泡节点:', box);
    return;
  }

  if (activePopupState && activePopupState.box === box) {
    placePopup(box, popup);
    return;
  }

  closeActivePopup();

  const parent = popup.parentNode;
  const nextSibling = popup.nextSibling;

  // Temporarily make visible in original parent so CSS rules apply, then snapshot
  popup.style.display = 'block';
  popup.style.visibility = 'hidden';
  const captured = captureStyle(popup);
  popup.style.display = '';
  popup.style.visibility = '';

  ROOT_DOCUMENT.body.appendChild(popup);
  applyFloatingStyle(popup, captured);
  placePopup(box, popup);
  box.classList.add('thp-open');

  activePopupState = { box, popup, parent, nextSibling };
}

function requestReposition() {
  if (!activePopupState) return;

  if (rafId) {
    ROOT_WINDOW.cancelAnimationFrame(rafId);
  }

  rafId = ROOT_WINDOW.requestAnimationFrame(() => {
    rafId = 0;

    if (!activePopupState) return;
    if (!activePopupState.box.isConnected || !activePopupState.popup.isConnected) {
      closeActivePopup();
      return;
    }

    placePopup(activePopupState.box, activePopupState.popup);
  });
}

function handlePointerDown(event) {
  const target = event.target;
  if (!target || target.nodeType !== 1 || typeof target.closest !== 'function') return;

  if (activePopupState && activePopupState.popup.contains(target)) {
    return;
  }

  const box = target.closest(BOX_SELECTOR);
  if (box) {
    ROOT_WINDOW.setTimeout(() => openPopupForBox(box), 0);
    return;
  }

  closeActivePopup();
}

function handleKeyDown(event) {
  if (event.key === 'Escape') {
    closeActivePopup();
  }
}

function handleMutations() {
  if (!activePopupState) return;
  if (!activePopupState.box.isConnected) {
    closeActivePopup();
    return;
  }
  requestReposition();
}

function bindScript() {
  ROOT_DOCUMENT.addEventListener('pointerdown', handlePointerDown, true);
  ROOT_DOCUMENT.addEventListener('keydown', handleKeyDown, true);
  ROOT_WINDOW.addEventListener('resize', requestReposition);
  ROOT_WINDOW.addEventListener('scroll', requestReposition, true);

  observer = new MutationObserver(handleMutations);
  observer.observe(ROOT_DOCUMENT.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  logBoxCount('脚本已加载');
}

function unbindScript() {
  closeActivePopup();
  ROOT_DOCUMENT.removeEventListener('pointerdown', handlePointerDown, true);
  ROOT_DOCUMENT.removeEventListener('keydown', handleKeyDown, true);
  ROOT_WINDOW.removeEventListener('resize', requestReposition);
  ROOT_WINDOW.removeEventListener('scroll', requestReposition, true);

  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

$(() => {
  bindScript();
});

$(window).on('pagehide', () => {
  unbindScript();
});
