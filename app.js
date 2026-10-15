'use strict';

/* ==========================================================================
   State
   ========================================================================== */
const MAX_CHARACTERS = 20;
const STORAGE_KEY = 'rfi_state_v1';

const state = {
  characters: [],      // [{ id, name, initiative, image }]
  activeIndex: 0,
  round: 1,
  bgColor: '#000000',
  bgImage: null,
  lairActionActive: false,
  lairActionPassed: false,
  legendaryActive: false,
};

/* ==========================================================================
   DOM References
   ========================================================================== */
const dom = {
  topbar: document.getElementById('topbar'),
  stage: document.getElementById('stage'),
  carousel: document.getElementById('carousel'),
  roundNumber: document.getElementById('round-number'),
  positionDisplay: document.getElementById('position-display'),
  fullscreenBtn: document.getElementById('fullscreen-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  overlay: document.getElementById('overlay'),
  addDrawer: document.getElementById('add-drawer'),
  settingsDrawer: document.getElementById('settings-drawer'),
  charName: document.getElementById('char-name'),
  charInit: document.getElementById('char-init'),
  charImage: document.getElementById('char-image'),
  imageUploadArea: document.getElementById('image-upload-area'),
  uploadPlaceholder: document.getElementById('upload-placeholder'),
  uploadPreview: document.getElementById('upload-preview'),
  addConfirm: document.getElementById('add-confirm'),
  addDone: document.getElementById('add-done'),
  charCount: document.getElementById('char-count'),
  bgColor: document.getElementById('bg-color'),
  bgColorValue: document.getElementById('bg-color-value'),
  bgImageInput: document.getElementById('bg-image-input'),
  bgUploadArea: document.getElementById('bg-upload-area'),
  bgUploadPlaceholder: document.getElementById('bg-upload-placeholder'),
  bgUploadPreview: document.getElementById('bg-upload-preview'),
  clearBgImage: document.getElementById('clear-bg-image'),
  charList: document.getElementById('char-list'),
  charListCount: document.getElementById('char-list-count'),
  clearAllChars: document.getElementById('clear-all-chars'),
  resetRound: document.getElementById('reset-round'),
  toast: document.getElementById('toast'),
};

/* ==========================================================================
   Card Element Cache (preserves DOM for CSS transitions)
   ========================================================================== */
const cardElements = new Map(); // id -> HTMLElement
let pendingImage = null; // base64 data URL for the add-character preview

/* ==========================================================================
   localStorage
   ========================================================================== */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    showToast('Storage full — try smaller images');
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
    // One-time migration: the old navy default is now black
    if (state.bgColor === '#1a1a2e') state.bgColor = '#000000';
    state.lairActionActive = !!state.lairActionActive;
    state.lairActionPassed = !!state.lairActionPassed;
    state.legendaryActive = !!state.legendaryActive;
  } catch (e) {
    console.warn('Failed to load saved state:', e);
  }
}

/* ==========================================================================
   Image Compression
   ========================================================================== */
function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ==========================================================================
   Carousel Rendering
   ========================================================================== */

// Perspective scale: active card stays largest; immediate neighbors (cards
// arriving/leaving center) are intentionally a bit bigger so the conveyor
// depth is legible, then sizes descend steadily toward the horizon.
const SCALE_MAP = [1.0, 0.50, 0.38, 0.28, 0.18, 0.11];

// Dynamically size cards so 7 visible cards (3 prev + active + 3 next) fill
// the screen width, constrained by available height (portrait 2:3 ratio).
function updateCardDimensions() {
  // Total width factor: 2 * (0.5 + s1 + s2 + s3) derived from cumulative spacing
  const widthFactor = 2 * (0.5 + SCALE_MAP[1] + SCALE_MAP[2] + SCALE_MAP[3]);

  const availWidth = window.innerWidth - 60;   // room for nav arrows
  const availHeight = window.innerHeight - 90; // header + breathing room

  const widthBased = availWidth / widthFactor;
  const heightBased = (availHeight * 0.9) * (2 / 3); // portrait 2:3

  let cardSize = Math.min(widthBased, heightBased);
  cardSize = Math.max(150, Math.min(cardSize, 560));

  const cardHeight = Math.round(cardSize * 1.5); // 2:3 portrait

  document.documentElement.style.setProperty('--card-size', cardSize + 'px');
  document.documentElement.style.setProperty('--card-height', cardHeight + 'px');
}

function getCardSize() {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue('--card-size')
    .trim();
  return parseInt(val, 10) || 220;
}

function getCardPosition(offset) {
  const absOffset = Math.abs(offset);

  const scale = absOffset < SCALE_MAP.length ? SCALE_MAP[absOffset] : 0.08;

  // Opacity: fade out away from center
  const opacityMap = [1.0, 0.85, 0.55, 0.28, 0.1, 0];
  const opacity = absOffset < opacityMap.length ? opacityMap[absOffset] : 0;

  // Cumulative horizontal position so adjacent card EDGES TOUCH (conveyor belt).
  // Step distance between card i-1 and i = cardSize * (scale[i-1] + scale[i]) / 2
  const cardSize = getCardSize();
  let x = 0;
  for (let i = 1; i <= absOffset; i++) {
    const prevScale = SCALE_MAP[i - 1] || 0.1;
    const currScale = SCALE_MAP[i] || 0.1;
    x += (cardSize * (prevScale + currScale)) / 2;
  }
  x *= Math.sign(offset || 1);

  // Very subtle vertical drift to enhance depth without breaking the belt feel
  const y = -Math.pow(absOffset, 1.4) * 4;

  // Gentle 3D rotation following the perspective
  const rotateY = offset * -8;

  // Z-index: right side (upcoming, positive offset) always layers above the
  // left side (previous, negative offset) so incoming cards pass over outgoing
  // cards without cutting in front of the central frame.
  const zIndex = offset >= 0 ? 100 - absOffset : 40 - absOffset;

  return { x, y, scale, rotateY, opacity, zIndex };
}

function createCardElement(char) {
  const el = document.createElement('div');
  el.className = 'character-card';
  el.dataset.id = char.id;

  const imgEl = document.createElement('div');
  imgEl.className = 'card-image';
  if (char.image) {
    imgEl.style.backgroundImage = `url('${char.image}')`;
  }

  const overlayEl = document.createElement('div');
  overlayEl.className = 'card-overlay';

  const nameEl = document.createElement('span');
  nameEl.className = 'card-name';
  nameEl.textContent = char.name;
  nameEl.title = 'Click to edit name';

  const initEl = document.createElement('span');
  initEl.className = 'card-init';
  initEl.textContent = char.initiative !== null && char.initiative !== ''
    ? char.initiative
    : '-';
  initEl.title = 'Click to edit initiative';

  const removeBtnEl = document.createElement('button');
  removeBtnEl.className = 'card-remove';
  removeBtnEl.innerHTML = '&#128128;';
  removeBtnEl.title = 'Remove character';
  removeBtnEl.setAttribute('aria-label', 'Remove character');
  removeBtnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    removeCharacter(char.id);
  });

  // --- Inline editing helpers ---
  function stopAndEdit(e) {
    e.stopPropagation();
  }

  function makeEditable(spanEl, isInitiative) {
    // Store original value so we can restore on cancel
    const originalText = spanEl.textContent;

    spanEl.contentEditable = 'true';
    spanEl.focus();
    // Clear the text so the user can type fresh
    spanEl.textContent = '';

    spanEl.addEventListener('click', stopAndEdit);

    function finishEdit() {
      spanEl.contentEditable = 'false';
      spanEl.removeEventListener('click', stopAndEdit);
      spanEl.removeEventListener('blur', finishEdit);
      spanEl.removeEventListener('keydown', onKey);

      let value = spanEl.textContent.trim();

      if (isInitiative) {
        // Only accept numbers
        if (value === '' || isNaN(Number(value))) {
          // Restore original
          spanEl.textContent = originalText;
          return;
        }
        char.initiative = value;
        spanEl.textContent = value;
        // Re-sort and re-render
        sortCharacters();
        // Find the new index of this character
        state.activeIndex = state.characters.findIndex((c) => c.id === char.id);
        renderCarousel();
      } else {
        if (!value) {
          // Restore original if nothing typed
          spanEl.textContent = originalText;
          return;
        }
        char.name = value;
        spanEl.textContent = value;
      }
      saveState();
      notifyRemote();
    }

    function onKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        spanEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        spanEl.textContent = originalText;
        spanEl.blur();
      }
      e.stopPropagation();
    }

    spanEl.addEventListener('blur', finishEdit);
    spanEl.addEventListener('keydown', onKey);
  }

  nameEl.addEventListener('click', function clickName(e) {
    if (nameEl.contentEditable === 'true') return;
    e.stopPropagation();
    makeEditable(nameEl, false);
  });

  initEl.addEventListener('click', function clickInit(e) {
    if (initEl.contentEditable === 'true') return;
    e.stopPropagation();
    // Start with just the number for easy editing
    if (initEl.textContent === '-') initEl.textContent = '';
    makeEditable(initEl, true);
  });

  overlayEl.appendChild(nameEl);
  overlayEl.appendChild(initEl);
  overlayEl.appendChild(removeBtnEl);
  el.appendChild(overlayEl);
  el.appendChild(imgEl);

  el.addEventListener('click', () => {
    const idx = state.characters.findIndex((c) => c.id === char.id);
    if (idx !== -1 && idx !== state.activeIndex) {
      state.activeIndex = idx;
      renderCarousel();
      saveState();
    }
  });

  return el;
}

function renderLairActionOverlay() {
  let overlay = document.getElementById('lair-overlay');
  const pending = isLairActionPending();

  if (pending) {
    if (overlay) {
      // Cancel any pending removal from a previous dismiss
      if (overlay._removeTimer) { clearTimeout(overlay._removeTimer); overlay._removeTimer = null; }
      overlay.classList.add('visible');
    } else {
      overlay = document.createElement('div');
      overlay.id = 'lair-overlay';
      overlay.innerHTML = '<span class="lair-text">LAIR ACTION</span>';
      document.body.appendChild(overlay);
      // Force reflow so the fade-in transition plays
      void overlay.offsetWidth;
      overlay.classList.add('visible');
    }
    document.body.classList.add('lair-active');
  } else {
    if (overlay && !overlay._removeTimer) {
      overlay.classList.remove('visible');
      overlay._removeTimer = setTimeout(() => { overlay.remove(); }, 1500);
    }
    document.body.classList.remove('lair-active');
  }
}

function renderLegendaryOverlay() {
  let overlay = document.getElementById('legendary-overlay');
  const showing = state.legendaryActive;

  if (showing) {
    if (overlay) {
      if (overlay._removeTimer) { clearTimeout(overlay._removeTimer); overlay._removeTimer = null; }
      overlay.classList.add('visible');
    } else {
      overlay = document.createElement('div');
      overlay.id = 'legendary-overlay';
      overlay.innerHTML = '<span class="lair-text">LEGENDARY ACTION</span>';
      document.body.appendChild(overlay);
      void overlay.offsetWidth;
      overlay.classList.add('visible');
    }
    document.body.classList.add('legendary-active');
  } else {
    if (overlay && !overlay._removeTimer) {
      overlay.classList.remove('visible');
      overlay._removeTimer = setTimeout(() => { overlay.remove(); }, 1500);
    }
    document.body.classList.remove('legendary-active');
  }
}

function renderCarousel() {
  renderLairActionOverlay();
  renderLegendaryOverlay();
  const N = state.characters.length;
  const stage = dom.carousel;

  // Handle empty state
  if (N === 0) {
    // Remove all card elements
    cardElements.forEach((el) => el.remove());
    cardElements.clear();

    // Remove existing empty state
    const existing = stage.querySelector('.empty-state');
    if (existing) existing.remove();

    // Hide the static frame when there are no characters
    document.getElementById('center-frame').classList.add('hidden');

    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = 'Open the DM remote to add characters.';
    stage.appendChild(empty);

    updatePositionDisplay();
    return;
  }

  // Remove empty state if present
  const emptyState = stage.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  // Ensure active index is valid
  state.activeIndex = ((state.activeIndex % N) + N) % N;

  // Show the static center frame
  document.getElementById('center-frame').classList.remove('hidden');

  // Remove cards for deleted characters
  for (const [id, el] of [...cardElements]) {
    if (!state.characters.find((c) => c.id === id)) {
      el.remove();
      cardElements.delete(id);
    }
  }

  // Update or create cards
  state.characters.forEach((char, i) => {
    let el = cardElements.get(char.id);
    if (!el) {
      el = createCardElement(char);
      stage.appendChild(el);
      cardElements.set(char.id, el);
    }

    // Update name/initiative in case they changed
    const nameEl = el.querySelector('.card-name');
    const initEl = el.querySelector('.card-init');
    const imgEl = el.querySelector('.card-image');
    if (nameEl) nameEl.textContent = char.name;
    if (initEl) {
      initEl.textContent = char.initiative !== null && char.initiative !== ''
        ? char.initiative
        : '-';
    }
    if (imgEl && char.image) {
      imgEl.style.backgroundImage = `url('${char.image}')`;
    }

    // Compute offset (shortest path around the circle)
    let offset = (i - state.activeIndex + N) % N;
    if (offset > N / 2) offset -= N;

    const pos = getCardPosition(offset);

    // Detect wrap-around: if the card's previous offset and new offset have
    // opposite signs AND both are far from center, the card is crossing the
    // "back" of the carousel. Teleport it invisibly instead of animating
    // across the screen through the central frame.
    const prevOffset = el.dataset.prevOffset !== undefined
      ? parseInt(el.dataset.prevOffset, 10)
      : null;

    const isWrapping =
      prevOffset !== null &&
      Math.sign(prevOffset) !== Math.sign(offset) &&
      prevOffset !== 0 &&
      offset !== 0 &&
      N >= 3;

    if (isWrapping) {
      // Instantly jump to the new position with opacity 0 (no transition),
      // then fade in on the next frame once positioned.
      const prevTransition = el.style.transition;
      el.style.transition = 'none';
      el.style.transform =
        `translateX(${pos.x}px) translateY(${pos.y}px) scale(${pos.scale}) rotateY(${pos.rotateY}deg)`;
      el.style.opacity = '0';
      el.style.zIndex = pos.zIndex;
      el.classList.toggle('active', offset === 0);
      // Force reflow so the instant jump commits before restoring transition
      void el.offsetWidth;
      el.style.transition = prevTransition;
      requestAnimationFrame(() => {
        el.style.opacity = pos.opacity;
      });
    } else {
      el.style.transform =
        `translateX(${pos.x}px) translateY(${pos.y}px) scale(${pos.scale}) rotateY(${pos.rotateY}deg)`;
      el.style.opacity = pos.opacity;
      el.style.zIndex = pos.zIndex;
      el.classList.toggle('active', offset === 0);
    }

    el.dataset.prevOffset = offset;
  });

  // The static center frame (in the HTML) provides the illumination
  updatePositionDisplay();
}

function updatePositionDisplay() {
  const N = state.characters.length;
  if (N === 0) {
    dom.positionDisplay.textContent = '';
  } else if (isLairActionPending()) {
    dom.positionDisplay.textContent = 'Lair';
  } else {
    dom.positionDisplay.textContent = `${state.activeIndex + 1} / ${N}`;
  }
  dom.roundNumber.textContent = state.round;
}

/* ==========================================================================
   Sound Effects
   ========================================================================== */
const sounds = {
  sword: new Audio(encodeURI('Sound Effects/Next Sword Impact.mp3')),
  spell: new Audio(encodeURI('Sound Effects/Next Spell Effect.mp3')),
  lair: new Audio(encodeURI('Sound Effects/Lair Action.mp3')),
  legendary: new Audio(encodeURI('Sound Effects/Legendary Action.mp3')),
};
let nextSoundIsSword = true;

function playSound(name) {
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  // .catch: browsers may block audio until the page has had user interaction
  s.play().catch(() => {});
}

/* ==========================================================================
   Navigation
   ========================================================================== */
function isLairActionPending() {
  if (!state.lairActionActive || state.lairActionPassed) return false;
  if (state.characters.length === 0) return false;
  const nextChar = state.characters[state.activeIndex];
  if (!nextChar) return false;
  return nextChar.initiative < 20;
}

function next() {
  const N = state.characters.length;
  if (N === 0) return;

  // Legendary action is a manual interrupt — Next dismisses it and moves on
  if (state.legendaryActive) {
    state.legendaryActive = false;
  }

  if (isLairActionPending()) {
    state.lairActionPassed = true;
    // Dismissing the lair overlay counts as a Next press for the sword/spell cycle
    playSound(nextSoundIsSword ? 'sword' : 'spell');
    nextSoundIsSword = !nextSoundIsSword;
    renderCarousel();
    saveState();
    notifyRemote();
    return;
  }

  state.activeIndex++;
  if (state.activeIndex >= N) {
    state.activeIndex = 0;
    state.round++;
    state.lairActionPassed = false;
  }
  renderCarousel();
  saveState();
  notifyRemote();

  // Lair fanfare replaces the turn sound when the new turn enters the
  // lair-action window; otherwise alternate sword/spell on each advance.
  if (isLairActionPending()) {
    playSound('lair');
  } else {
    playSound(nextSoundIsSword ? 'sword' : 'spell');
    nextSoundIsSword = !nextSoundIsSword;
  }
}

function prev() {
  const N = state.characters.length;
  if (N === 0) return;

  // Prev dismisses a legendary interrupt without moving
  if (state.legendaryActive) {
    state.legendaryActive = false;
    renderCarousel();
    saveState();
    notifyRemote();
    return;
  }

  state.activeIndex--;
  if (state.activeIndex < 0) {
    state.activeIndex = N - 1;
    state.round = Math.max(1, state.round - 1);
    // In a previous round, the lair action was already taken
    state.lairActionPassed = true;
  }
  renderCarousel();
  saveState();
  notifyRemote();
}

/* ==========================================================================
   Character Management
   ========================================================================== */
function sortCharacters() {
  state.characters.sort((a, b) => {
    const aInit = a.initiative === '' || a.initiative === null ? -Infinity : Number(a.initiative);
    const bInit = b.initiative === '' || b.initiative === null ? -Infinity : Number(b.initiative);
    return bInit - aInit;
  });
  checkAndShowTiebreaker();
}

/* ==========================================================================
   Tiebreak Resolution
   ========================================================================== */

// The tiebreak popup lives in the DM Remote (remote.html) so it appears on
// the DM's screen rather than the projected carousel. After every sort we
// just notify the remote; the remote detects ties from the snapshot and
// shows/hides its own popup. The DM applies the chosen order by calling
// back into RFI.applyTiebreakOrder(draft) below.
function checkAndShowTiebreaker() {
  notifyRemote();
}

function addCharacter(name, initiative, image) {
  if (state.characters.length >= MAX_CHARACTERS) {
    showToast(`Maximum ${MAX_CHARACTERS} characters reached`);
    return false;
  }

  const char = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim() || 'Unknown Hero',
    initiative: initiative,
    image: image,
  };

  state.characters.push(char);
  sortCharacters();

  // Set active index to the newly added character
  state.activeIndex = state.characters.findIndex((c) => c.id === char.id);

  renderCarousel();
  renderCharList();
  saveState();
  return true;
}

function removeCharacter(id) {
  const idx = state.characters.findIndex((c) => c.id === id);
  if (idx === -1) return;

  const wasActive = idx === state.activeIndex;

  state.characters.splice(idx, 1);

  if (state.characters.length === 0) {
    state.activeIndex = 0;
    state.round = 1;
  } else if (wasActive) {
    // Keep the same position (now pointing to the next character)
    if (state.activeIndex >= state.characters.length) {
      state.activeIndex = 0;
    }
  } else if (idx < state.activeIndex) {
    // Adjust active index if we removed someone before the active
    state.activeIndex--;
  }

  renderCarousel();
  renderCharList();
  saveState();
  showToast('Character removed');
}

function clearAllCharacters() {
  state.characters = [];
  state.activeIndex = 0;
  state.round = 1;
  renderCarousel();
  renderCharList();
  saveState();
  showToast('All characters cleared');
}

/* ==========================================================================
   Character List (Settings Panel)
   ========================================================================== */
function renderCharList() {
  const list = dom.charList;
  const count = state.characters.length;

  dom.charListCount.textContent = count;
  dom.charCount.textContent = `${count} / ${MAX_CHARACTERS} characters`;

  if (count === 0) {
    list.innerHTML = '<p class="empty-list-msg">No characters added yet.</p>';
    return;
  }

  list.innerHTML = '';
  state.characters.forEach((char) => {
    const item = document.createElement('div');
    item.className = 'char-list-item';

    const thumb = document.createElement('div');
    thumb.className = 'char-list-thumb';
    if (char.image) {
      thumb.style.backgroundImage = `url('${char.image}')`;
    }

    const info = document.createElement('div');
    info.className = 'char-list-info';

    const name = document.createElement('div');
    name.className = 'char-list-name';
    name.textContent = char.name;
    name.title = 'Click to edit';
    name.contentEditable = 'false';
    name.style.cursor = 'text';
    name.addEventListener('click', function () {
      if (name.contentEditable === 'true') return;
      name.contentEditable = 'true';
      name.focus();
      const range = document.createRange();
      range.selectNodeContents(name);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    name.addEventListener('blur', function () {
      name.contentEditable = 'false';
      const val = name.textContent.trim();
      char.name = val || 'Unknown';
      name.textContent = char.name;
      saveState();
      renderCarousel();
    });
    name.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
      if (e.key === 'Escape') {
        name.textContent = char.name;
        name.blur();
      }
      e.stopPropagation();
    });

    const init = document.createElement('div');
    init.className = 'char-list-init';
    init.textContent = `Initiative: ${char.initiative !== '' && char.initiative !== null ? char.initiative : '-'}`;
    init.title = 'Click to edit';
    init.contentEditable = 'false';
    init.style.cursor = 'text';
    init.addEventListener('click', function () {
      if (init.contentEditable === 'true') return;
      // Show just the number for editing
      init.textContent = char.initiative !== '' && char.initiative !== null ? char.initiative : '';
      init.contentEditable = 'true';
      init.focus();
      const range = document.createRange();
      range.selectNodeContents(init);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    init.addEventListener('blur', function () {
      init.contentEditable = 'false';
      const val = init.textContent.trim();
      if (val === '' || isNaN(Number(val))) {
        init.textContent = `Initiative: ${char.initiative !== '' && char.initiative !== null ? char.initiative : '-'}`;
        return;
      }
      char.initiative = val;
      sortCharacters();
      state.activeIndex = state.characters.findIndex((c) => c.id === char.id);
      saveState();
      renderCharList();
      renderCarousel();
    });
    init.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); init.blur(); }
      if (e.key === 'Escape') {
        init.textContent = `Initiative: ${char.initiative !== '' && char.initiative !== null ? char.initiative : '-'}`;
        init.blur();
      }
      e.stopPropagation();
    });

    info.appendChild(name);
    info.appendChild(init);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'char-list-remove';
    removeBtn.innerHTML = '&#128128;';
    removeBtn.title = 'Remove character';
    removeBtn.addEventListener('click', () => removeCharacter(char.id));

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

/* ==========================================================================
   Drawer / Panel Management
   ========================================================================== */
function closeDrawers(fadeOverlay) {
  dom.addDrawer.classList.remove('open');
  dom.settingsDrawer.classList.remove('open');
  if (fadeOverlay !== false) {
    dom.overlay.classList.remove('visible');
  }
  // Reset add-character form
  pendingImage = null;
  dom.charName.value = '';
  dom.charInit.value = '';
  dom.uploadPreview.style.display = 'none';
  dom.uploadPlaceholder.style.display = '';
  dom.charImage.value = '';
}

/* ==========================================================================
   Fullscreen
   ========================================================================== */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      showToast('Fullscreen not available');
    });
  } else {
    document.exitFullscreen();
  }
}

/* ==========================================================================
   Background
   ========================================================================== */
function applyBackground() {
  document.body.style.backgroundColor = state.bgColor;
  if (state.bgImage) {
    document.body.style.backgroundImage = `url('${state.bgImage}')`;
  } else {
    document.body.style.backgroundImage = '';
  }
  dom.bgColor.value = state.bgColor;
  dom.bgColorValue.textContent = state.bgColor;

  if (state.bgImage) {
    dom.bgUploadPreview.style.display = '';
    dom.bgUploadPreview.src = state.bgImage;
    dom.bgUploadPlaceholder.style.display = 'none';
    dom.clearBgImage.style.display = '';
  } else {
    dom.bgUploadPreview.style.display = 'none';
    dom.bgUploadPlaceholder.style.display = '';
    dom.clearBgImage.style.display = 'none';
  }
}

/* ==========================================================================
   Toast
   ========================================================================== */
let toastTimer = null;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 2500);
}

/* ==========================================================================
   Event Wiring
   ========================================================================== */
function wireEvents() {
  // Fullscreen
  dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Remote
  dom.settingsBtn.addEventListener('click', () => {
    openRemote();
  });

  dom.overlay.addEventListener('click', () => closeDrawers(true));

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeDrawers(true));
  });

  dom.addDone.addEventListener('click', () => closeDrawers(true));

  // Image upload (add character)
  dom.imageUploadArea.addEventListener('click', () => dom.charImage.click());
  dom.charImage.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      pendingImage = await compressImage(file, 1200, 0.90);
      dom.uploadPreview.src = pendingImage;
      dom.uploadPreview.style.display = '';
      dom.uploadPlaceholder.style.display = 'none';
    } catch {
      showToast('Failed to load image');
    }
  });

  // Add character confirm
  dom.addConfirm.addEventListener('click', () => {
    const name = dom.charName.value.trim();
    const initiative = dom.charInit.value.trim();

    if (!name) {
      showToast('Please enter a character name');
      dom.charName.focus();
      return;
    }

    const added = addCharacter(name, initiative, pendingImage);
    if (added) {
      showToast(`${name} added!`);
      // Reset form for next entry
      dom.charName.value = '';
      dom.charInit.value = '';
      pendingImage = null;
      dom.uploadPreview.style.display = 'none';
      dom.uploadPlaceholder.style.display = '';
      dom.charImage.value = '';
      dom.charName.focus();
      dom.charCount.textContent = `${state.characters.length} / ${MAX_CHARACTERS} characters`;
    }
  });

  // Enter key to add character
  dom.charName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.addConfirm.click();
  });
  dom.charInit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.addConfirm.click();
  });

  // Background color
  dom.bgColor.addEventListener('input', (e) => {
    state.bgColor = e.target.value;
    dom.bgColorValue.textContent = state.bgColor;
    document.body.style.backgroundColor = state.bgColor;
    saveState();
  });

  // Background image upload
  dom.bgUploadArea.addEventListener('click', () => dom.bgImageInput.click());
  dom.bgImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      state.bgImage = await compressImage(file, 1920, 0.85);
      applyBackground();
      saveState();
      showToast('Background image set');
    } catch {
      showToast('Failed to load image');
    }
  });

  // Clear background image
  dom.clearBgImage.addEventListener('click', () => {
    state.bgImage = null;
    applyBackground();
    saveState();
    showToast('Background image removed');
  });

  // Clear all characters
  dom.clearAllChars.addEventListener('click', () => {
    if (state.characters.length === 0) return;
    if (confirm('Remove all characters? This cannot be undone.')) {
      clearAllCharacters();
    }
  });

  // Reset round
  dom.resetRound.addEventListener('click', () => {
    state.round = 1;
    state.activeIndex = 0;
    renderCarousel();
    saveState();
    showToast('New combat started — Round 1');
    if (isLairActionPending()) playSound('lair');
  });

  // Keyboard shortcuts (same as the DM remote)
  // Space/→ = Next, ← = Previous, Enter = Start Combat, K = Lair,
  // L = Legendary, F = Fullscreen, Esc = Close drawers / exit fullscreen
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
              t.isContentEditable)) return;
    // Allow shortcuts on color/file inputs — just blur them first
    if (t && t.tagName === 'INPUT' &&
        t.type !== 'color' && t.type !== 'file') {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (t && t.tagName === 'INPUT') t.blur();

    switch (e.key) {
      case ' ':
      case 'ArrowRight':
        e.preventDefault();
        next();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prev();
        break;
      case 'Enter':
        e.preventDefault();
        RFI.startCombat();
        break;
      case 'k':
      case 'K':
        e.preventDefault();
        RFI.setLairAction(!state.lairActionActive);
        break;
      case 'l':
      case 'L':
        e.preventDefault();
        RFI.setLegendaryAction(!state.legendaryActive);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'Escape':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          closeDrawers(true);
        }
        break;
    }
  });
}

/* ==========================================================================
   Remote Control Popup
   ========================================================================== */
let remoteWindow = null;

function openRemote() {
  if (remoteWindow && !remoteWindow.closed) {
    remoteWindow.focus();
    return;
  }
  const w = screen.availWidth || screen.width || window.innerWidth;
  // Cache-bust query string so the remote always loads the latest remote.html
  const url = `remote.html?v=${Date.now()}`;
  remoteWindow = window.open(url, 'rfi-remote', `width=${w},height=110,left=0,top=0,menubar=no,toolbar=no,location=no,status=no`);
}

// API exposed for the remote popup to call
window.RFI = {
  onStateChange: null,

  getSnapshot() {
    return {
      characters: JSON.parse(JSON.stringify(state.characters)),
      bgColor: state.bgColor,
      bgImage: state.bgImage,
      round: state.round,
      activeIndex: state.activeIndex,
      lairActionActive: state.lairActionActive,
      lairActionPending: isLairActionPending(),
      legendaryActive: state.legendaryActive,
      fullscreen: !!document.fullscreenElement,
    };
  },

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      return document.documentElement.requestFullscreen().then(() => true);
    }
    return document.exitFullscreen().then(() => false);
  },

  addCharacter(name, initiative, image) {
    if (state.characters.length >= MAX_CHARACTERS) return false;
    const char = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: name.trim(),
      initiative: initiative,
      image: image,
    };
    state.characters.push(char);
    sortCharacters();
    state.activeIndex = state.characters.findIndex((c) => c.id === char.id);
    renderCarousel();
    saveState();
    notifyRemote();
    return true;
  },

  removeCharacter(id) {
    const idx = state.characters.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const wasActive = idx === state.activeIndex;
    state.characters.splice(idx, 1);
    if (state.characters.length === 0) { state.activeIndex = 0; state.round = 1; }
    else if (wasActive && state.activeIndex >= state.characters.length) { state.activeIndex = 0; }
    else if (idx < state.activeIndex) { state.activeIndex--; }
    renderCarousel();
    saveState();
    notifyRemote();
  },

  updateCharacter(id, updates) {
    const char = state.characters.find((c) => c.id === id);
    if (!char) return;
    Object.assign(char, updates);
    if ('initiative' in updates) {
      sortCharacters();
      state.activeIndex = state.characters.findIndex((c) => c.id === id);
    }
    renderCarousel();
    saveState();
    notifyRemote();
  },

  clearAllCharacters() {
    state.characters = [];
    state.activeIndex = 0;
    state.round = 1;
    renderCarousel();
    saveState();
    notifyRemote();
  },

  setBgColor(color) {
    state.bgColor = color;
    applyBackground();
    saveState();
    notifyRemote();
  },

  setBgImage(image) {
    state.bgImage = image;
    applyBackground();
    saveState();
    notifyRemote();
  },

  clearBgImage() {
    state.bgImage = null;
    applyBackground();
    saveState();
    notifyRemote();
  },

  setLairAction(active) {
    state.lairActionActive = !!active;
    if (!active) state.lairActionPassed = false;
    renderCarousel();
    saveState();
    notifyRemote();
  },

  setLegendaryAction(active) {
    state.legendaryActive = !!active;
    if (state.legendaryActive) playSound('legendary');
    renderCarousel();
    saveState();
    notifyRemote();
  },

  startCombat() {
    state.round = 1;
    state.lairActionPassed = false;
    state.legendaryActive = false;
    state.activeIndex = 0;
    renderCarousel();
    saveState();
    notifyRemote();
    // If the first character is below 20, the lair notice appears immediately
    if (isLairActionPending()) playSound('lair');
  },

  next() {
    next();
  },

  prev() {
    prev();
  },

  // Apply a tiebreak ordering chosen by the DM via the remote's popup.
  // `draft` maps an initiative key (string) to an ordered array of character IDs.
  // We permute state.characters within each tie group's contiguous block; we do
  // NOT call sortCharacters() afterwards so the manual order is preserved (stable
  // sort keeps it on future re-sorts).
  applyTiebreakOrder(draft) {
    if (!draft || typeof draft !== 'object') return;
    for (const initiative of Object.keys(draft)) {
      const newOrderIds = draft[initiative];
      if (!Array.isArray(newOrderIds)) continue;
      const charsById = {};
      for (const id of newOrderIds) {
        const ch = state.characters.find(c => c.id === id);
        if (ch) charsById[id] = ch;
      }
      // Find indices in state.characters that currently hold these IDs
      const indices = newOrderIds
        .map(id => state.characters.findIndex(c => c.id === id))
        .filter(i => i !== -1)
        .sort((a, b) => a - b);
      // Replace the characters at those indices with the draft order
      indices.forEach((stateIdx, draftPos) => {
        const desiredId = newOrderIds[draftPos];
        if (desiredId && charsById[desiredId]) {
          state.characters[stateIdx] = charsById[desiredId];
        }
      });
    }
    renderCarousel();
    renderCharList();
    saveState();
    notifyRemote();
  },
};

function notifyRemote() {
  if (remoteWindow && !remoteWindow.closed && window.RFI.onStateChange) {
    window.RFI.onStateChange();
  }
}

/* ==========================================================================
   Init
   ========================================================================== */
function init() {
  loadState();
  applyBackground();
  wireEvents();
  updateCardDimensions();
  renderCarousel();
  renderCharList();
  updatePositionDisplay();

  // Re-render on resize so card sizes/positions follow viewport changes
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateCardDimensions();
      renderCarousel();
    }, 150);
  });
}

init();
