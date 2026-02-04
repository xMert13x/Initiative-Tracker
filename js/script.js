let touchDraggingIndex = null;

let characters = [];
let currentTurn = 0;
let draggedIndex = null;

// Initialize sound variables at the very top to avoid initialization errors
let soundMuted = localStorage.getItem("soundMuted") === "true";
let turnSound;
try {
  turnSound = new Audio("sounds/turn.mp3");
  turnSound.volume = 0.1;
  turnSound.preload = "auto";
} catch (error) {
  // Create a dummy sound object to prevent errors
  turnSound = {
    currentTime: 0,
    play: () => Promise.resolve()
  };
}

const row = document.getElementById("characterRow");

function saveGame() {
  const saveData = {
    characters: characters,
    currentTurn: currentTurn
  };

  localStorage.setItem(
    "initiativeTrackerSave",
    JSON.stringify(saveData)
  );
}
function saveToFile() {
  if (characters.length === 0) {
    alert("No characters to save.");
    return;
  }

  const defaultName = "roll-for-initiative-save";
  const name = prompt("Name your save file:", defaultName);

  if (!name) return; // user cancelled

  const saveData = {
    characters,
    currentTurn,
    version: 1
  };

  const blob = new Blob(
    [JSON.stringify(saveData, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_ ]/gi, "_")}.json`;

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderCharacters() {
  row.innerHTML = "";

  if (currentTurn >= characters.length) currentTurn = 0;

  // Check if we're in the remote window
  const isRemote = window.location.pathname.includes('remote.html');

  if (isRemote) {
    // Fixed thumbnail size for remote window
    const characterWidth = 35;
    const characterHeight = 35;
    const nameFontSize = 7;

    characters.forEach((character, index) => {
      const div = document.createElement("div");
      div.className = "character";
      if (index === currentTurn) div.classList.add("active");
      div.draggable = true;

      div.innerHTML = `
        <div style="width:${characterWidth}px; height:${characterHeight}px; overflow:hidden;">
          <img src="${character.image}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <p style="font-size:${nameFontSize}px; margin:2px 0 0;">
          <strong>${character.name}</strong>
        </p>
      `;

      // Drag & drop
      div.addEventListener("dragstart", () => draggedIndex = index);
      div.addEventListener("dragover", (event) => event.preventDefault());
      div.addEventListener("drop", () => {
        if (draggedIndex === null || draggedIndex === index) return;
        
        const activeCharacter = currentTurn < characters.length ? characters[currentTurn] : null;
        
        const moved = characters.splice(draggedIndex, 1)[0];
        characters.splice(index, 0, moved);
        draggedIndex = null;
        
        if (activeCharacter) {
          const newIndex = characters.findIndex(c => c.name === activeCharacter.name && c.image === activeCharacter.image);
          if (newIndex !== -1) {
            currentTurn = newIndex;
          }
        }
        
        saveGame();
        renderCharacters();
      });

      // Delete button
      const deleteTab = document.createElement('div');
      deleteTab.className = 'delete-tab';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      
      const skullSpan = document.createElement('span');
      skullSpan.className = 'skull';
      skullSpan.textContent = 'X';
      
      deleteBtn.appendChild(skullSpan);
      deleteTab.appendChild(deleteBtn);
      div.appendChild(deleteTab);
      
      deleteBtn.addEventListener('click', () => {
        characters.splice(index, 1);
        
        if (index === currentTurn) {
          if (currentTurn >= characters.length) {
            currentTurn = 0;
          }
        } else if (index < currentTurn) {
          currentTurn--;
        }
        
        saveGame();
        renderCharacters();
      });

      row.appendChild(div);
    });

    updateActiveCharacter();
    return;
  }

  // Regular rendering for main window
const GAP = 10;                 // visual gap between cards
const MAX_CHARACTER_WIDTH = 250;
const MIN_CHARACTER_WIDTH = 130;

// Measure the actual row width (NOT window width)
const rowWidth = row.clientWidth;

// Total gap space between characters
const totalGapWidth = GAP * (characters.length - 1);

// Available width for character cards
const availableWidth = rowWidth - totalGapWidth;

// Final width per character
const characterWidth = Math.max(
  MIN_CHARACTER_WIDTH,
  Math.min(
    availableWidth / Math.max(characters.length, 1),
    MAX_CHARACTER_WIDTH
  )
);

  // Set height proportional to width (for uniform display boxes)
const isFullscreen = document.fullscreenElement !== null;

// Calculate dynamic ratio based on character width to prevent stretching
const baseRatio = isFullscreen ? 1.8 : 1.5;
const minRatio = isFullscreen ? 1.4 : 1.2;
const widthFactor = (characterWidth - MIN_CHARACTER_WIDTH) / (MAX_CHARACTER_WIDTH - MIN_CHARACTER_WIDTH);
const ratio = minRatio + (baseRatio - minRatio) * Math.min(widthFactor, 1);

const maxHeight = Math.max(
  Math.min(
    characterWidth * ratio,
    isFullscreen ? 460 : 400
  ),
  150
);

const nameFontSize = getNameFontSize(characters.length);

  characters.forEach((character, index) => {
    const div = document.createElement("div");
    div.className = "character";
    if (index === currentTurn) div.classList.add("active");
    div.draggable = true;

    div.style.width = `${characterWidth}px`;
    div.style.flex = `0 0 ${characterWidth}px`;

    div.innerHTML = `
  <div style="height:${maxHeight}px; width:100%; overflow:hidden;">
    <img src="${character.image}" style="width:100%; height:100%; object-fit:cover;">
  </div>
  <p>
    <strong style="font-size:${nameFontSize}px;">
      ${character.name}
    </strong>
  </p>
  <div class="delete-tab">
    <button class="delete-btn"><span class="skull">☠</span></button>
  </div>
`;


    // Drag & drop
    div.addEventListener("dragstart", () => draggedIndex = index);
    div.addEventListener("dragover", (event) => event.preventDefault());
    div.addEventListener("drop", () => {
      if (draggedIndex === null || draggedIndex === index) return;
      
      const activeCharacter = currentTurn < characters.length ? characters[currentTurn] : null;
      
      const moved = characters.splice(draggedIndex, 1)[0];
      characters.splice(index, 0, moved);
      draggedIndex = null;
      
      if (activeCharacter) {
        const newIndex = characters.findIndex(c => c.name === activeCharacter.name && c.image === activeCharacter.image);
        if (newIndex !== -1) {
          currentTurn = newIndex;
        }
      }
      
      saveGame();
      renderCharacters();
      
    });

    // ===== TOUCH SUPPORT (iOS / iPad) =====
    div.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;

      touchDraggingIndex = index;
      div.setPointerCapture(e.pointerId);
    });

    div.addEventListener("pointerenter", () => {
      if (touchDraggingIndex === null) return;
      if (touchDraggingIndex === index) return;

      const moved = characters.splice(touchDraggingIndex, 1)[0];
      characters.splice(index, 0, moved);
      touchDraggingIndex = index;

      saveGame();
      renderCharacters();
    });

    div.addEventListener("pointerup", () => {
      touchDraggingIndex = null;
    });


    // Delete button
    div.querySelector(".delete-btn").addEventListener("click", () => {
      characters.splice(index, 1);
      
      if (index === currentTurn) {
        if (currentTurn >= characters.length) {
          currentTurn = 0;
        }
      } else if (index < currentTurn) {
        currentTurn--;
      }
      
      saveGame();
      renderCharacters();
    });

    row.appendChild(div);
  });

  updateActiveCharacter();
}

function updateActiveCharacter() {
  const cards = document.querySelectorAll(".character");

  cards.forEach((card, index) => {
    card.classList.toggle("active", index === currentTurn);
  });
}

function getNameFontSize(characterCount) {
  if (characterCount <= 4) return 28;
  if (characterCount <= 6) return 24;
  if (characterCount <= 8) return 20;
  if (characterCount <= 10) return 16;
  return 11;
}

function nextTurn() {
  if (characters.length === 0) return;

  currentTurn = (currentTurn + 1) % characters.length;

  playTurnSound();
  saveGame();

  updateActiveCharacter(); // ← THIS is the key
}


function addCharacter() {
  const nameInput = document.getElementById("charName");
  const imageInput = document.getElementById("charImage");

  const name = nameInput.value.trim();
  const file = imageInput.files[0];

  if (!name || !file) {
    alert("Please enter a name and select an image.");
    return;
  }

  const reader = new FileReader();

  reader.onload = function () {
    // Create an image element to load the file
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      const maxSize = 500; // maximum width or height
      let width = img.width;
      let height = img.height;

      // Scale proportionally
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Get the resized image as base64
      const resizedData = canvas.toDataURL("image/png");

      // Add the character to the array
      characters.push({
        name: name,
        image: resizedData
      });

      saveGame();
      renderCharacters();

      // Clear inputs and hide dialog if it exists
      nameInput.value = "";
      imageInput.value = "";
      
      // Hide add character dialog if it exists (for remote)
      const addCharDialog = document.getElementById('addCharDialog');
      if (addCharDialog) {
        addCharDialog.style.display = 'none';
      }
    };

    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}


function loadGame() {
  const savedData = localStorage.getItem("initiativeTrackerSave");

  if (!savedData) {
    characters = [];
    currentTurn = 0;
    return;
  }

  const saveData = JSON.parse(savedData);
  characters = saveData.characters || [];
  currentTurn = saveData.currentTurn || 0;
}

let activeTheme = localStorage.getItem("initiativeTheme") || "default";

function loadTheme() {
  const savedTheme =
    localStorage.getItem("initiativeTheme") || "default";

  activeTheme = savedTheme;

  // Remove all theme-* classes first
  document.body.classList.forEach(cls => {
    if (cls.startsWith("theme-")) {
      document.body.classList.remove(cls);
    }
  });

  if (savedTheme === "custom") {
    const customBg = localStorage.getItem("customBackground");
    if (customBg) {
      document.body.style.backgroundImage = `url(${customBg})`;
    } else {
      // Fallback if custom is missing
      document.body.classList.add("theme-default");
      activeTheme = "default";
      localStorage.setItem("initiativeTheme", "default");
    }
  } else {
    document.body.style.backgroundImage = "";
    document.body.classList.add(`theme-${savedTheme}`);
  }
}



function loadFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function () {
    try {
      const data = JSON.parse(reader.result);

      if (!Array.isArray(data.characters)) {
        alert("Invalid save file.");
        return;
      }

      characters = data.characters;
      currentTurn = data.currentTurn || 0;

      saveGame();       // optional: sync to localStorage
      renderCharacters();
    } catch (e) {
      alert("Failed to load save file.");
    }
  };

  reader.readAsText(file);

  // reset input so the same file can be loaded again
  event.target.value = "";
}


function resetTracker() {
  if (!confirm("Are you sure you want to reset the tracker? This will remove all characters.")) {
    return; // cancel if user clicks "Cancel"
  }

  characters = [];
  currentTurn = 0;
  localStorage.removeItem("initiativeTrackerSave"); // clear saved game
  renderCharacters(); // update the UI
}

loadGame();
loadTheme();
renderCharacters();

const themeToggle = document.getElementById("themeToggle");
const themeMenu = document.getElementById("themeMenu");

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    themeMenu.style.display =
      themeMenu.style.display === "block" ? "none" : "block";
  });
}

function setTheme(theme) {
  activeTheme = theme;
  localStorage.setItem("initiativeTheme", theme);

  // Remove all theme-* classes
  document.body.classList.forEach(cls => {
    if (cls.startsWith("theme-")) {
      document.body.classList.remove(cls);
    }
  });

  if (theme === "custom") {
    const customBg = localStorage.getItem("customBackground");
    if (customBg) {
      document.body.style.backgroundImage = `url(${customBg})`;
    }
  } else {
    document.body.style.backgroundImage = "";
    document.body.classList.add(`theme-${theme}`);
  }

  themeMenu.style.display = "none";
  // enforceFullscreenUIState(); // Removed - function not needed
}

const customBgBtn = document.getElementById("customBgBtn");
const customBgInput = document.getElementById("customBgInput");

customBgBtn.addEventListener("click", () => {
  customBgInput.click();
});

customBgInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // ✅ Save current theme BEFORE custom background
  const currentTheme =
    localStorage.getItem("initiativeTheme") || "default";
  localStorage.setItem("previousTheme", currentTheme);

  const reader = new FileReader();
 reader.onload = function () {
  const dataUrl = reader.result;
  localStorage.setItem("customBackground", dataUrl);
  setTheme("custom");
};
  reader.readAsDataURL(file);

  customBgInput.value = "";
});


const themeOrder = [
  "default",
  "dungeon",
  "forest",
  "arcane",
  "spooky",
  "hellfire",
  "icy",
  "townsquare",
  "fey",
  "custom"
];

function toggleThemeByKey() {
  const current = activeTheme || "default";
  const index = themeOrder.indexOf(current);
  const next = themeOrder[(index + 1) % themeOrder.length];
  setTheme(next);
}


function toggleFullscreen() {
  const elem = document.documentElement;

  if (!document.fullscreenElement) {
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) { // Safari
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { // IE11
      elem.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

function enforceFullscreenCursorState() {
  if (!document.fullscreenElement) return;

  document.body.classList.remove("cursor-hidden");

  if (cursorTimeout) clearTimeout(cursorTimeout);

  cursorTimeout = setTimeout(() => {
    document.body.classList.add("cursor-hidden");
  }, CURSOR_HIDE_DELAY);
}


window.addEventListener("resize", renderCharacters);

function playTurnSound() {
  if (soundMuted) return;

  try {
    turnSound.currentTime = 0;
    turnSound.play().catch(() => {});
  } catch (error) {
    // Silently handle missing sound file
  }
}

function toggleMute() {
  soundMuted = !soundMuted;
  localStorage.setItem("soundMuted", soundMuted);

  updateMuteButton();
}

function updateMuteButton() {
  const btn = document.getElementById("muteBtn");
  if (!btn) return;

  // Check if we're in the remote window
  const isRemote = window.location.pathname.includes('remote.html');
  
  if (isRemote) {
    // Remote window: always show "Toggle Sound"
    btn.textContent = "Toggle Sound";
  } else {
    // Main window: show speaker emojis
    btn.textContent = soundMuted ? "🔇" : "🔊";
  }
}

const muteBtn = document.getElementById("muteBtn");
if (muteBtn) {
  muteBtn.addEventListener("click", toggleMute);
}

const remoteBtn = document.getElementById("remoteBtn");
if (remoteBtn) {
  remoteBtn.addEventListener("click", () => {
    window.open(
      "remote.html",
      "DMRremote",
      "width=480,height=350,top=100,left=100,menubar=no,toolbar=no,location=no,scrollbars=no,resizable=0,minimizable=yes,maximizable=0"
    );
  });
}

updateMuteButton();
const CURSOR_HIDE_DELAY = 1000; // 1 second
let cursorTimeout = null;

function resetCursorTimer() {
  if (!document.body.classList.contains("fullscreen")) return;

  // Show cursor immediately
  document.body.classList.remove("cursor-hidden");

  // Clear previous timer
  if (cursorTimeout) clearTimeout(cursorTimeout);

  // Start new timer
  cursorTimeout = setTimeout(() => {
    document.body.classList.add("cursor-hidden");
  }, CURSOR_HIDE_DELAY);
}

// Mouse movement brings cursor back
document.addEventListener("mousemove", resetCursorTimer);
document.addEventListener("mousedown", resetCursorTimer);


document.addEventListener("fullscreenchange", () => {
  const isFullscreen = !!document.fullscreenElement;

  // Toggle fullscreen class for CSS
  document.body.classList.toggle("fullscreen", isFullscreen);

  // Recalculate character layout
  renderCharacters();

  if (isFullscreen) {
    // Start cursor hide timer
    resetCursorTimer();
  } else {
    // Restore cursor and keyboard control
    document.body.classList.remove("cursor-hidden");
    if (cursorTimeout) clearTimeout(cursorTimeout);

    // Restore keyboard focus so shortcuts work immediately
    document.body.focus();
  }
});

// Add event listeners with null checks
const nextTurnBtn = document.getElementById("nextTurnBtn");
if (nextTurnBtn) {
  nextTurnBtn.addEventListener("click", nextTurn);
}

const fullscreenBtn = document.getElementById("fullscreenBtn");
if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", toggleFullscreen);
}

const resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
  resetBtn.addEventListener("click", resetTracker);
}

const saveBtn = document.getElementById("saveBtn");
if (saveBtn) {
  saveBtn.addEventListener("click", saveToFile);
}

const loadBtn = document.getElementById("loadBtn");
if (loadBtn) {
  loadBtn.addEventListener("click", () => {
    const loadFileInput = document.getElementById("loadFileInput");
    if (loadFileInput) {
      loadFileInput.click();
    }
  });
}

// Add click event listener to hidden fullscreen trigger
const fullscreenTrigger = document.getElementById("fullscreenTrigger");
if (fullscreenTrigger) {
  fullscreenTrigger.addEventListener("click", toggleFullscreen);
}

document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const key = event.key.toLowerCase();

  if (key === "n") nextTurn();
  if (key === "t") toggleThemeByKey();
  if (key === "m") toggleMute();
  if (key === "f") toggleFullscreen();
  if (key === "r") {
    const remoteBtn = document.getElementById("remoteBtn");
    if (remoteBtn) remoteBtn.click();
  }
});

// Listen for storage changes from other tabs/windows (for remote.html synchronization)
window.addEventListener('storage', function(event) {
  if (event.key === 'initiativeTrackerSave') {
    loadGame();
    renderCharacters();
  }
  if (event.key === 'initiativeTheme') {
    loadTheme();
  }
  if (event.key === 'soundMuted') {
    soundMuted = localStorage.getItem('soundMuted') === 'true';
    updateMuteButton();
  }
});

