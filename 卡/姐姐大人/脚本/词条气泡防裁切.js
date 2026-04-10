(() => {
  if (window.__thPopupEdgeGuardLoaded) {
    return;
  }
  window.__thPopupEdgeGuardLoaded = true;

  const MARGIN = 10;
  const GAP = 8;
  const BOX_SELECTOR = '.wbox,.abox,.jbox';
  const TRIGGER_SELECTOR = '.wtrig,.atrig,.jtrig';
  const POP_SELECTOR = '.wpop,.apop,.jpop';

  let current = null;

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  function closePopup() {
    if (!current) return;

    const { pop } = current;
    pop.style.display = 'none';
    pop.style.position = '';
    pop.style.left = '';
    pop.style.top = '';
    pop.style.zIndex = '';
    pop.style.margin = '';
    pop.style.visibility = '';

    current = null;
  }

  function placePopup(trigger, pop) {
    pop.style.display = 'block';
    pop.style.position = 'fixed';
    pop.style.left = '0px';
    pop.style.top = '0px';
    pop.style.margin = '0';
    pop.style.visibility = 'hidden';
    pop.style.zIndex = '99999';

    const triggerRect = trigger.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = triggerRect.left;
    if (left + popRect.width > vw - MARGIN) {
      left = triggerRect.right - popRect.width;
    }
    left = clamp(left, MARGIN, vw - MARGIN - popRect.width);

    const spaceAbove = triggerRect.top - MARGIN - GAP;
    const spaceBelow = vh - triggerRect.bottom - MARGIN - GAP;

    let top;
    if (spaceAbove >= popRect.height || spaceAbove >= spaceBelow) {
      top = triggerRect.top - GAP - popRect.height;
    } else {
      top = triggerRect.bottom + GAP;
    }
    top = clamp(top, MARGIN, vh - MARGIN - popRect.height);

    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    pop.style.visibility = 'visible';
  }

  function openPopup(trigger) {
    const box = trigger.closest(BOX_SELECTOR);
    const pop = box?.querySelector(POP_SELECTOR);
    if (!box || !pop) return;

    if (current && current.pop === pop) {
      closePopup();
      return;
    }

    closePopup();
    current = { trigger, pop };
    placePopup(trigger, pop);
  }

  function refreshCurrentPosition() {
    if (!current) return;
    placePopup(current.trigger, current.pop);
  }

  document.addEventListener(
    'click',
    event => {
      const trigger = event.target.closest(TRIGGER_SELECTOR);
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        openPopup(trigger);
        return;
      }

      if (current && current.pop.contains(event.target)) {
        return;
      }

      closePopup();
    },
    true,
  );

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePopup();
    }
  });

  window.addEventListener('resize', refreshCurrentPosition, { passive: true });
  window.addEventListener('scroll', refreshCurrentPosition, true);

  console.log('[词条气泡防裁切] 已启用');
})();
