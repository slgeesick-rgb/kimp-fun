const screens = {
  splash: document.getElementById('splash-screen'),
  create: document.getElementById('create-screen'),
  join: document.getElementById('join-screen'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen'),
  results: document.getElementById('results-screen'),
};

const elements = {
  toastContainer: document.getElementById('toast-container'),
  createForm: document.getElementById('create-form'),
  createName: document.getElementById('create-name'),
  createTarget: document.getElementById('create-target'),
  createMax: document.getElementById('create-max'),
  createPasscode: document.getElementById('create-passcode'),
  createPasscodeEnabled: document.getElementById('create-passcode-enabled'),
  createDeathPenalty: document.getElementById('create-death-penalty'),
  createTimeout: document.getElementById('create-timeout'),
  createSpaceship: document.getElementById('create-spaceship'),
  createSpaceshipGrid: document.getElementById('create-spaceship-grid'),
  joinForm: document.getElementById('join-form'),
  joinLink: document.getElementById('join-link'),
  joinName: document.getElementById('join-name'),
  joinPasscode: document.getElementById('join-passcode'),
  joinSpaceship: document.getElementById('join-spaceship'),
  joinSpaceshipGrid: document.getElementById('join-spaceship-grid'),
  joinScreen: document.getElementById('join-screen'),
  playerList: document.getElementById('player-list'),
  roomId: document.getElementById('room-id'),
  roomConfig: document.getElementById('room-config'),
  copyLink: document.getElementById('copy-link'),
  startButton: document.getElementById('start-game'),
  scoreList: document.getElementById('score-list'),
  progressFill: document.getElementById('progress-fill'),
  currentScore: document.getElementById('current-score'),
  targetScore: document.getElementById('target-score'),
  winnerAnnouncement: document.getElementById('winner-announcement'),
  resultsList: document.getElementById('results-list'),
  rematch: document.getElementById('rematch'),
  resultsCopyLink: document.getElementById('results-copy-link'),
  muteToggle: document.getElementById('mute-toggle'),
  graphicsToggle: document.getElementById('graphics-toggle'),
  splashCreate: document.getElementById('splash-create'),
  splashJoin: document.getElementById('splash-join'),
  actionButton: document.getElementById('action-button'),
  joystick: document.getElementById('joystick'),
  joystickHandle: document.getElementById('joystick-handle'),
  canvas: document.getElementById('game-canvas'),
  effectLayer: document.getElementById('effect-layer'),
  leaveGame: document.getElementById('leave-game'),
  tipText: document.getElementById('tip-text'),
  roomTimer: document.getElementById('room-timer'),
  timerDisplay: document.getElementById('timer-display'),
  connectionIndicator: document.getElementById('connection-indicator'),
  fullscreenToggle: document.getElementById('fullscreen-toggle'),
  fullscreenProgress: document.getElementById('fullscreen-progress'),
  fullscreenProgressFill: document.getElementById('fullscreen-progress-fill'),
  fullscreenCurrentScore: document.getElementById('fullscreen-current-score'),
  fullscreenTargetScore: document.getElementById('fullscreen-target-score'),
  fullscreenScoreboard: document.getElementById('fullscreen-scoreboard'),
  fullscreenScoreList: document.getElementById('fullscreen-score-list'),
  canvasWrapper: document.querySelector('.canvas-wrapper'),
};

const ctx = elements.canvas.getContext('2d', { 
  alpha: false,
  desynchronized: true,
  willReadFrequently: false 
});

// Initialize with smooth rendering by default
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

// Set rendering quality and resolution based on graphics mode
function updateRenderingQuality() {
  if (state.lowGraphics) {
    elements.canvas.classList.add('pixelated');
  } else {
    elements.canvas.classList.remove('pixelated');
  }
  // Resize canvas to apply new resolution scale
  resizeCanvas();
}

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${location.host}`;

const assets = {
  blast: '/assets/blast.gif',
  enemy: '/assets/enemy.webp',
  background: '/assets/game-bg.webp',
};

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 900;
const PLAYER_WORLD_RADIUS = 18;
const PLAYER_MOVE_SPEED = 380; // pixels per second, mirrors server constant
const ENEMY_WORLD_RADIUS = 22;
const BLAST_EFFECT_DURATION = 4000;
const TOTAL_SPACESHIPS = 15;

const blastPreload = new Image();
blastPreload.src = assets.blast;

const enemyImage = new Image();
enemyImage.src = assets.enemy;

const backgroundImage = new Image();
backgroundImage.src = assets.background;

// Preload spaceship images
const spaceshipImages = {};
let spaceshipsLoaded = 0;
let cachedCreateSelection = null;
let cachedJoinSelection = null;
let joinAvailabilityTimer = null;
for (let i = 1; i <= TOTAL_SPACESHIPS; i++) {
  const img = new Image();
  img.onload = () => {
    console.debug(`Spaceship ${i} loaded`);
    spaceshipsLoaded++;
    if (spaceshipsLoaded === TOTAL_SPACESHIPS) {
      console.debug('All spaceships loaded');
      // Re-render any visible spaceship grids
      if (elements.createSpaceshipGrid && elements.createSpaceshipGrid.offsetParent !== null) {
        renderSpaceshipGrid(elements.createSpaceshipGrid, elements.createSpaceship);
      }
      if (elements.joinSpaceshipGrid && elements.joinSpaceshipGrid.offsetParent !== null) {
        renderSpaceshipGrid(elements.joinSpaceshipGrid, elements.joinSpaceship);
      }
    }
  };
  img.onerror = () => console.error(`Failed to load spaceship ${i}`);
  img.src = `/assets/players/player${i}.webp`;
  spaceshipImages[i] = img;
}
console.debug('Started loading', TOTAL_SPACESHIPS, 'spaceships');

const state = {
  screen: 'splash',
  ws: null,
  reconnecting: false,
  playerId: null,
  isHost: false,
  roomId: null,
  hostKey: null,
  joinUrl: null,
  passcode: null,
  lastLobbyState: null,
  gameState: null,
  resultsState: null,
  resultsConfirmed: false,
  config: null,
  lowGraphics: false,
  muted: false,
  inputSeq: 0,
  pendingAction: false,
  pendingPowerup: false,
  joystickDir: { x: 0, y: 0 },
  combinedDir: { x: 0, y: 0 },
  thrustInput: 0,
  cursorAngle: 0,
  cursorWorld: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
  hasPointer: false,
  localPlayer: null,
  lastSentInput: null,
  lastInputSentAt: 0,
  lastScores: new Map(),
  scoreHistory: new Map(),
  leavingPlayers: new Map(), // playerId -> { x, y, startTime, animationTime }
  powerupEffects: [], // Array of { x, y, startTime, duration }
  respawnEffects: new Map(), // playerId -> { x, y, startTime, duration }
  selectedSpaceship: null,
  takenSpaceships: new Set(), // Track which spaceships are taken in the room
  lastFetchedRoomId: null,
  lastRoomFetchTimestamp: 0,
  roomCreatedAt: null,
  roomTimeoutMinutes: null,
  // Connection quality monitoring
  lastServerUpdate: 0,
  updateLatency: [],
  messagesSent: 0,
  messagesReceived: 0,
};

// Game tips for players
const gameTips = [
  "Use WASD or Arrow keys to move your spaceship",
  "Press SPACE to Jump on to the near enemies to destroy them",
  "Collect Yellow power-ups to boost your score",
  "Avoid colliding with enemies to stay alive",
  "Each kill earns points toward victory",
  "If death penalty is on, dying reduces your score",
  "Keep moving to dodge enemy attacks"
];

let currentTipIndex = 0;
let tipRotationInterval = null;

function rotateTip() {
  if (elements.tipText) {
    elements.tipText.textContent = gameTips[currentTipIndex];
    currentTipIndex = (currentTipIndex + 1) % gameTips.length;
  }
}

function startTipRotation() {
  if (tipRotationInterval) clearInterval(tipRotationInterval);
  rotateTip(); // Show first tip immediately
  tipRotationInterval = setInterval(rotateTip, 8000); // Rotate every 8 seconds
}

function stopTipRotation() {
  if (tipRotationInterval) {
    clearInterval(tipRotationInterval);
    tipRotationInterval = null;
  }
  if (elements.tipText) {
    elements.tipText.textContent = '';
  }
}

// Room timer functions
let timerInterval = null;
let timeoutTriggered = false;

function updateRoomTimer() {
  if (!state.roomCreatedAt || !state.roomTimeoutMinutes) {
    hideRoomTimer();
    return;
  }

  const now = Date.now();
  const expiresAt = state.roomCreatedAt + (state.roomTimeoutMinutes * 60 * 1000);
  const remainingMs = expiresAt - now;

  if (remainingMs <= 0) {
    elements.timerDisplay.textContent = '00:00';
    elements.timerDisplay.className = 'timer-display critical';
    
    // Trigger timeout only once and only if game is running
    if (!timeoutTriggered && state.screen === 'game') {
      timeoutTriggered = true;
      handleGameTimeout();
    }
    return;
  }

  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
  const timeString = `${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  
  elements.timerDisplay.textContent = timeString;

  // Change color based on remaining time
  if (remainingMs < 60000) { // Less than 1 minute
    elements.timerDisplay.className = 'timer-display critical';
  } else if (remainingMs < 180000) { // Less than 3 minutes
    elements.timerDisplay.className = 'timer-display warning';
  } else {
    elements.timerDisplay.className = 'timer-display';
  }
}

function handleGameTimeout() {
  hideRoomTimer();
  state.resultsConfirmed = true; // Set to true so rematch button works
  
  // Notify server about timeout (only host can do this)
  if (state.isHost && state.ws) {
    sendMessage({ type: 'timeout' });
  }
  
  // Create a timeout result state
  const timeoutResults = {
    players: state.gameState?.players || [],
    scores: Array.from(state.lastScores.entries()).map(([id, score]) => {
      const player = state.gameState?.players?.find(p => p.id === id);
      return {
        id,
        name: player?.name || 'Unknown',
        score,
        spaceship: player?.spaceship
      };
    }),
    config: state.config
  };
  
  state.resultsState = timeoutResults;
  
  // Show results with timeout message
  showScreen('results');
  renderResults({ winnerId: null, state: timeoutResults, timedOut: true });
}

function startRoomTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timeoutTriggered = false; // Reset timeout flag when starting timer
  if (elements.roomTimer) {
    elements.roomTimer.style.display = 'flex';
  }
  updateRoomTimer();
  timerInterval = setInterval(updateRoomTimer, 1000);
}

function hideRoomTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (elements.roomTimer) {
    elements.roomTimer.style.display = 'none';
  }
}

// Connection quality monitoring
function updateConnectionQuality() {
  if (!elements.connectionIndicator) return;
  
  // Only show during active game
  if (state.screen !== 'game' || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
    elements.connectionIndicator.style.display = 'none';
    return;
  }
  
  elements.connectionIndicator.style.display = 'flex';
  
  // Calculate average latency
  if (state.updateLatency.length === 0) return;
  
  const avgLatency = state.updateLatency.reduce((a, b) => a + b, 0) / state.updateLatency.length;
  const maxLatency = Math.max(...state.updateLatency);
  
  // Classify connection quality
  let quality = 'good';
  let text = 'Good';
  
  if (avgLatency > 100 || maxLatency > 200) {
    quality = 'fair';
    text = 'Fair';
  }
  
  if (avgLatency > 200 || maxLatency > 400) {
    quality = 'poor';
    text = 'Poor';
  }
  
  // Update indicator
  elements.connectionIndicator.className = `connection-indicator ${quality}`;
  const textElement = elements.connectionIndicator.querySelector('.connection-text');
  if (textElement) {
    textElement.textContent = text;
  }
}

// Update connection quality every 2 seconds
setInterval(updateConnectionQuality, 2000);

// Session persistence functions
function saveSession() {
  if (state.roomId && state.playerId) {
    const session = {
      roomId: state.roomId,
      playerId: state.playerId,
      isHost: state.isHost,
      hostKey: state.hostKey,
      passcode: state.passcode,
      joinUrl: state.joinUrl,
      spaceship: state.selectedSpaceship,
      timestamp: Date.now()
    };
    sessionStorage.setItem('kimpfun_session', JSON.stringify(session));
  }
}

function loadSession() {
  const saved = sessionStorage.getItem('kimpfun_session');
  if (!saved) return null;
  
  try {
    const session = JSON.parse(saved);
    // Session expires after 2 hours
    if (Date.now() - session.timestamp > 2 * 60 * 60 * 1000) {
      sessionStorage.removeItem('kimpfun_session');
      return null;
    }
    return session;
  } catch (err) {
    console.warn('Failed to load session', err);
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem('kimpfun_session');
}

const audio = {
  ctx: null,
  muted: false,
  ensureContext() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        console.warn('AudioContext unsupported', err);
      }
    }
  },
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('Audio resume failed', err);
      }
    }
  },
  async playTone(freq = 660, duration = 0.12, gainValue = 0.12) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;
    await this.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  },
};

document.addEventListener('pointerdown', () => audio.ensureContext(), { once: true });
document.addEventListener('keydown', () => audio.ensureContext(), { once: true });

elements.muteToggle.addEventListener('click', () => {
  state.muted = !state.muted;
  audio.muted = state.muted;
  elements.muteToggle.textContent = state.muted ? 'Muted' : 'Mute';
  showToast(state.muted ? 'Audio muted' : 'Audio on', 'info', 2000);
});

elements.graphicsToggle.addEventListener('click', () => {
  state.lowGraphics = !state.lowGraphics;
  elements.graphicsToggle.textContent = `Pixelated Mode: ${state.lowGraphics ? 'On' : 'Off'}`;
  
  // Apply rendering quality changes
  updateRenderingQuality();
  
  showToast(state.lowGraphics ? 'Pixelated mode enabled - Lag should be reduced' : 'Pixelated mode disabled - Full graphics restored', 'info', 2000);
});

document.querySelectorAll('button[data-nav="splash"]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen('splash'));
});

elements.splashCreate.addEventListener('click', () => {
  cachedJoinSelection = state.selectedSpaceship;
  state.selectedSpaceship = cachedCreateSelection;
  elements.createSpaceship.value = cachedCreateSelection ? String(cachedCreateSelection) : '';
  state.takenSpaceships.clear();
  state.lastFetchedRoomId = null;
  state.lastRoomFetchTimestamp = 0;
  showScreen('create');
  renderSpaceshipGrid(elements.createSpaceshipGrid, elements.createSpaceship);
  elements.createName.focus();
});

elements.splashJoin.addEventListener('click', () => {
  cachedCreateSelection = state.selectedSpaceship;
  state.selectedSpaceship = cachedJoinSelection;
  elements.joinSpaceship.value = cachedJoinSelection ? String(cachedJoinSelection) : '';
  showScreen('join');
  if (!elements.joinLink.value) {
    state.takenSpaceships.clear();
    state.lastFetchedRoomId = null;
    state.lastRoomFetchTimestamp = 0;
    cachedJoinSelection = null;
    state.selectedSpaceship = null;
    elements.joinSpaceship.value = '';
  }
  renderSpaceshipGrid(elements.joinSpaceshipGrid, elements.joinSpaceship);
  if (elements.joinLink.value) {
    scheduleRoomAvailabilityFetch(elements.joinLink.value);
  }
  elements.joinLink.focus();
});

elements.createPasscodeEnabled.addEventListener('change', (event) => {
  const enabled = event.target.checked;
  elements.createPasscode.disabled = !enabled;
  if (!enabled) {
    elements.createPasscode.value = '';
  }
});

// Spaceship selection functions
function renderSpaceshipGrid(gridElement, inputElement) {
  gridElement.innerHTML = '';
  for (let i = 1; i <= TOTAL_SPACESHIPS; i++) {
    const isTaken = state.takenSpaceships.has(i);

    if (gridElement.id === 'join-spaceship-grid' && isTaken) {
      continue; // Hide taken ships in the join grid
    }

    const option = document.createElement('div');
    option.className = 'spaceship-option';
    option.dataset.spaceship = i;

    // Use preloaded image if available, otherwise create new one
    const preloadedImg = spaceshipImages[i];
    if (preloadedImg && preloadedImg.complete) {
      const img = document.createElement('img');
      img.src = preloadedImg.src;
      img.alt = `Spaceship ${i}`;
      img.draggable = false;
      option.appendChild(img);
    } else {
      // Fallback: create new image element
      const img = document.createElement('img');
      img.src = `/assets/players/player${i}.webp`;
      img.alt = `Spaceship ${i}`;
      img.draggable = false;
      option.appendChild(img);
    }

    // Check if this spaceship is taken
    if (isTaken) {
      option.classList.add('taken');
    } else {
      option.addEventListener('click', () => {
        if (!state.takenSpaceships.has(i)) {
          selectSpaceship(gridElement, inputElement, i);
        }
      });
    }
    
    // Mark as selected if it's the current selection
    if (state.selectedSpaceship === i) {
      option.classList.add('selected');
      inputElement.value = i;
    }
    
    gridElement.appendChild(option);
  }

  if (gridElement.id === 'join-spaceship-grid') {
    const noAvailable = gridElement.childElementCount === 0 && state.takenSpaceships.size >= TOTAL_SPACESHIPS;
    gridElement.classList.toggle('no-available', noAvailable);
  }
}

function selectSpaceship(gridElement, inputElement, spaceshipId) {
  state.selectedSpaceship = spaceshipId;
  inputElement.value = spaceshipId;
  if (gridElement.id === 'create-spaceship-grid') {
    cachedCreateSelection = spaceshipId;
  } else if (gridElement.id === 'join-spaceship-grid') {
    cachedJoinSelection = spaceshipId;
  }
  
  // Update UI
  gridElement.querySelectorAll('.spaceship-option').forEach(opt => {
    opt.classList.remove('selected');
    if (parseInt(opt.dataset.spaceship) === spaceshipId) {
      opt.classList.add('selected');
    }
  });
}

function updateTakenSpaceships(players) {
  state.takenSpaceships.clear();
  if (players) {
    players.forEach(player => {
      if (player.spaceship && player.id !== state.playerId) {
        state.takenSpaceships.add(player.spaceship);
      }
    });
  }

  const joinScreenActive = elements.joinScreen && elements.joinScreen.classList.contains('active');
  const joinSelectionTaken = cachedJoinSelection && state.takenSpaceships.has(cachedJoinSelection);

  if (joinSelectionTaken) {
    cachedJoinSelection = null;
  }

  if (joinScreenActive) {
    state.selectedSpaceship = cachedJoinSelection;
    if (elements.joinSpaceship) {
      elements.joinSpaceship.value = cachedJoinSelection ? String(cachedJoinSelection) : '';
    }
    renderSpaceshipGrid(elements.joinSpaceshipGrid, elements.joinSpaceship);
  }
}

const ROOM_AVAILABILITY_DEBOUNCE_MS = 300;

function scheduleRoomAvailabilityFetch(rawValue) {
  clearTimeout(joinAvailabilityTimer);
  joinAvailabilityTimer = setTimeout(() => {
    const roomId = parseRoomId(rawValue);
    if (roomId) {
      if (state.lastFetchedRoomId && state.lastFetchedRoomId !== roomId) {
        state.takenSpaceships.clear();
        state.lastFetchedRoomId = null;
        state.lastRoomFetchTimestamp = 0;
        cachedJoinSelection = null;
        if (elements.joinScreen && elements.joinScreen.classList.contains('active')) {
          state.selectedSpaceship = null;
          if (elements.joinSpaceship) {
            elements.joinSpaceship.value = '';
          }
          renderSpaceshipGrid(elements.joinSpaceshipGrid, elements.joinSpaceship);
        }
      }
      fetchRoomAvailability(roomId);
    }
  }, ROOM_AVAILABILITY_DEBOUNCE_MS);
}

async function fetchRoomAvailability(roomId, { force = false } = {}) {
  if (!roomId) return;

  const now = Date.now();
  if (!force && state.lastFetchedRoomId === roomId && now - state.lastRoomFetchTimestamp < 2000) {
    return;
  }

  try {
    const response = await fetch(`/api/room/${roomId}`);
    if (response.status === 404) {
      state.lastFetchedRoomId = null;
      state.lastRoomFetchTimestamp = now;
      updateTakenSpaceships([]);
      return;
    }
    if (!response.ok) {
      throw new Error(`Room lookup failed (${response.status})`);
    }

    const data = await response.json();
    state.lastFetchedRoomId = roomId;
    state.lastRoomFetchTimestamp = Date.now();
    updateTakenSpaceships(data.players || []);
  } catch (err) {
    console.warn('Room availability check failed', err);
  }
}

elements.createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  
  if (!state.selectedSpaceship || !elements.createSpaceship.value) {
    showStatus('⚠️ Please select a spaceship first', true);
    elements.createSpaceshipGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  
  const payload = {
    name: elements.createName.value,
    targetScore: Number(elements.createTarget.value),
    maxPlayers: Number(elements.createMax.value),
    passcode: elements.createPasscode.value,
    passcodeEnabled: elements.createPasscodeEnabled.checked,
    deathPenaltyEnabled: elements.createDeathPenalty.checked,
    roomTimeoutMinutes: Number(elements.createTimeout.value),
  };

  try {
    const response = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to create room');
    }
    const data = await response.json();
    state.roomId = data.roomId;
    state.hostKey = data.hostKey;
    state.config = data.config;
    state.joinUrl = data.joinUrl || buildJoinUrl(data.roomId, elements.createName.value);
    state.passcode = payload.passcode;
    showStatus('Room created. Connecting…');
    connectSocket({
      roomId: state.roomId,
      name: elements.createName.value,
      hostKey: state.hostKey,
      passcode: payload.passcode,
      spaceship: state.selectedSpaceship,
    });
  } catch (err) {
    console.error(err);
    showStatus(err.message || 'Could not create room', true);
  }
});

elements.joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const roomId = parseRoomId(elements.joinLink.value);
  if (!roomId) {
    showStatus('Enter a valid room link or ID', true);
    return;
  }
  
  if (!state.selectedSpaceship || !elements.joinSpaceship.value) {
    showStatus('⚠️ Please select a spaceship first', true);
    elements.joinSpaceshipGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  
  state.roomId = roomId;
  state.hostKey = null;
  state.joinUrl = buildJoinUrl(roomId, elements.joinName.value);
  state.passcode = elements.joinPasscode.value || null;
  showStatus('Joining room…');
  connectSocket({
    roomId,
    name: elements.joinName.value,
    passcode: state.passcode,
    spaceship: state.selectedSpaceship,
  });
});

elements.joinLink.addEventListener('input', () => {
  if (elements.joinScreen && elements.joinScreen.classList.contains('active')) {
    scheduleRoomAvailabilityFetch(elements.joinLink.value);
  }
});

elements.joinLink.addEventListener('blur', () => {
  if (elements.joinScreen && elements.joinScreen.classList.contains('active')) {
    scheduleRoomAvailabilityFetch(elements.joinLink.value);
  }
});

elements.copyLink.addEventListener('click', () => copyRoomLink());
elements.resultsCopyLink.addEventListener('click', () => copyRoomLink());

elements.startButton.addEventListener('click', () => {
  if (!state.isHost || !state.ws) return;
  sendMessage({ type: 'start' });
});

elements.rematch.addEventListener('click', () => {
  if (!state.ws) {
    showToast('Not connected to server', 'error', 2000);
    return;
  }
  
  if (!state.isHost) {
    showToast('Only the host can start a rematch', 'info', 3000);
    return;
  }
  
  if (!state.resultsConfirmed) {
    showToast('Finishing timeout… try again in a moment.', 'info', 2000);
    return;
  }
  
  sendMessage({ type: 'rematch' });
});

elements.leaveGame.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave the game?')) {
    leaveGame();
  }
});

function leaveGame() {
  // Close WebSocket connection
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  
  // Clear session
  clearSession();
  
  // Reset state
  state.playerId = null;
  state.roomId = null;
  state.isHost = false;
  state.hostKey = null;
  state.joinUrl = null;
  state.passcode = null;
  state.lastLobbyState = null;
  state.gameState = null;
  state.resultsState = null;
  state.resultsConfirmed = false;
  state.localPlayer = null;
  state.thrustInput = 0;
  state.joystickDir = { x: 0, y: 0 };
  state.combinedDir = { x: 0, y: 0 };
  state.cursorAngle = 0;
  state.hasPointer = false;
  state.lastSentInput = null;
  state.lastInputSentAt = 0;
  
  clearEffectLayer();
  
  // Hide timer and leave button
  hideRoomTimer();
  elements.leaveGame.style.display = 'none';
  
  // Go to splash screen
  showScreen('splash');
  showToast('Left the game', 'info', 2000);
}

elements.actionButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  queueAction();
});

elements.actionButton.addEventListener('mousedown', (e) => {
  e.preventDefault();
  queueAction();
});

elements.canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    queueAction();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    heldKeys.clear();
    state.thrustInput = 0;
    state.joystickDir = { x: 0, y: 0 };
    updateCombinedInput();
  }
});

const keyMap = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
};

const heldKeys = new Set();

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'Space') {
    queuePowerup();
    event.preventDefault();
    return;
  }
  const dir = keyMap[event.code];
  if (!dir) return;
  heldKeys.add(dir);
  updateKeyboardDir();
});

window.addEventListener('keyup', (event) => {
  const dir = keyMap[event.code];
  if (!dir) return;
  heldKeys.delete(dir);
  updateKeyboardDir();
});

setupJoystick();
setupPointerTracking();

function queueAction() {
  state.pendingAction = true;
}

function queuePowerup() {
  state.pendingPowerup = true;
}

function updateKeyboardDir() {
  let thrust = 0;
  if (heldKeys.has('forward')) thrust += 1;
  if (heldKeys.has('backward')) thrust -= 1;
  state.thrustInput = Math.max(-1, Math.min(1, thrust));
  updateCombinedInput();
}

function setupJoystick() {
  if (!elements.joystick) return;
  let active = false;
  let pointerId = null;
  const baseRect = () => elements.joystick.getBoundingClientRect();

  const start = (event) => {
    const touch = event.touches ? event.touches[0] : event;
    active = true;
    pointerId = touch.identifier ?? 'mouse';
    handleMove(touch);
  };

  const end = () => {
    active = false;
    pointerId = null;
    state.joystickDir = { x: 0, y: 0 };
    elements.joystickHandle.style.transform = 'translate(0px, 0px)';
    updateCombinedInput();
  };

  const handleMove = (inputEvent) => {
    if (!active) return;
    const rect = baseRect();
    const x = (inputEvent.clientX - rect.left) - rect.width / 2;
    const y = (inputEvent.clientY - rect.top) - rect.height / 2;
    const maxRadius = rect.width / 2 - 12;
    const limited = limitVector({ x, y }, maxRadius);
    elements.joystickHandle.style.transform = `translate(${limited.x}px, ${limited.y}px)`;
    const normalized = normalizeVector(limited);
    state.joystickDir = normalized;
    if (Math.hypot(normalized.x, normalized.y) > 0.01) {
      state.cursorAngle = wrapAngle(Math.atan2(normalized.y, normalized.x));
      state.hasPointer = false;
    }
    updateCombinedInput();
  };

  elements.joystick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    start(e);
  });
  elements.joystick.addEventListener('touchmove', (e) => {
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === pointerId);
    if (touch) {
      e.preventDefault();
      handleMove(touch);
    }
  });
  elements.joystick.addEventListener('touchend', (e) => {
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === pointerId);
    if (touch) {
      e.preventDefault();
      end();
    }
  });
  elements.joystick.addEventListener('mousedown', (e) => {
    e.preventDefault();
    start(e);
    const move = (evt) => handleMove(evt);
    const up = () => {
      end();
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

function setupPointerTracking() {
  if (!elements.canvas) return;

  const updateFromPointerEvent = (event) => {
    if (!state.gameState || state.screen !== 'game') return;
    updateCursorFromClientPoint(event.clientX, event.clientY);
  };

  elements.canvas.addEventListener('pointermove', (event) => {
    updateFromPointerEvent(event);
  });

  elements.canvas.addEventListener('pointerdown', (event) => {
    if (elements.canvas.setPointerCapture) {
      elements.canvas.setPointerCapture(event.pointerId);
    }
    updateFromPointerEvent(event);
  });

  elements.canvas.addEventListener('pointerup', (event) => {
    if (elements.canvas.releasePointerCapture) {
      elements.canvas.releasePointerCapture(event.pointerId);
    }
  });

  elements.canvas.addEventListener('pointerleave', () => {
    state.hasPointer = false;
    updateCombinedInput();
  });
}

function updateCursorFromClientPoint(clientX, clientY) {
  const rect = elements.canvas.getBoundingClientRect();
  const ratioX = clamp((clientX - rect.left) / rect.width, 0, 1);
  const ratioY = clamp((clientY - rect.top) / rect.height, 0, 1);
  const worldX = ratioX * WORLD_WIDTH;
  const worldY = ratioY * WORLD_HEIGHT;
  state.cursorWorld = { x: worldX, y: worldY };

  const originX = state.localPlayer?.x ?? WORLD_WIDTH / 2;
  const originY = state.localPlayer?.y ?? WORLD_HEIGHT / 2;
  const dx = worldX - originX;
  const dy = worldY - originY;

  if (Math.hypot(dx, dy) < 0.001) {
    return;
  }

  const angle = wrapAngle(Math.atan2(dy, dx));
  state.cursorAngle = angle;
  state.hasPointer = true;

  if (state.localPlayer) {
    state.localPlayer.targetAngle = angle;
  }

  updateCombinedInput();
}

// Predict the local player's movement between authoritative snapshots to hide latency.
function stepLocalPrediction(deltaMs) {
  if (!state.localPlayer) return;
  if (!state.gameState || state.gameState.state !== 'running') return;

  const local = state.localPlayer;
  const seconds = clamp(deltaMs / 1000, 0, 0.12);

  if (!local.alive) {
    if (typeof local.serverX === 'number') {
      local.x = local.serverX;
      local.y = local.serverY;
    }
    return;
  }

  const dir = state.combinedDir;
  const magnitude = dir ? Math.hypot(dir.x, dir.y) : 0;

  if (magnitude > 0.01) {
    const normalized = magnitude > 1.0001 ? normalizeVector(dir) : dir;
    const speed = PLAYER_MOVE_SPEED;
    local.x += normalized.x * speed * seconds;
    local.y += normalized.y * speed * seconds;
  }

  local.x = clamp(local.x, PLAYER_WORLD_RADIUS, WORLD_WIDTH - PLAYER_WORLD_RADIUS);
  local.y = clamp(local.y, PLAYER_WORLD_RADIUS, WORLD_HEIGHT - PLAYER_WORLD_RADIUS);

  if (typeof local.serverX === 'number' && typeof local.serverY === 'number') {
    const correction = clamp(seconds * 6, 0, 1);
    local.x += (local.serverX - local.x) * correction;
    local.y += (local.serverY - local.y) * correction;
  }

  const pointerAngle = state.hasPointer ? state.cursorAngle : (local.targetAngle ?? state.cursorAngle);
  if (typeof pointerAngle === 'number') {
    local.targetAngle = pointerAngle;
  }
  const targetAngle = local.targetAngle ?? state.cursorAngle ?? local.angle ?? 0;
  if (state.hasPointer) {
    local.angle = targetAngle;
  } else {
    const rotationSpeed = 14; // radians per second when using non-pointer controls
    local.angle = rotateTowards(local.angle ?? targetAngle, targetAngle, rotationSpeed * seconds);
  }

  if (!state.hasPointer && Math.hypot(state.joystickDir.x, state.joystickDir.y) < 0.01) {
    state.cursorAngle = wrapAngle(local.angle);
  }

  local.aim = local.angle;
}

function syncLocalPlayerFromServer(serialized) {
  if (!serialized || !serialized.players) return;
  const serverPlayer = serialized.players.find((player) => player.id === state.playerId);
  if (!serverPlayer) {
    state.localPlayer = null;
    return;
  }

  const now = performance.now();

  if (!state.localPlayer) {
    const initialAngle = typeof serverPlayer.aim === 'number'
      ? wrapAngle(serverPlayer.aim)
      : wrapAngle(state.cursorAngle ?? 0);
    state.localPlayer = {
      id: serverPlayer.id,
      x: serverPlayer.x,
      y: serverPlayer.y,
      angle: initialAngle,
      targetAngle: initialAngle,
      serverX: serverPlayer.x,
      serverY: serverPlayer.y,
      lastServerAt: now,
      alive: serverPlayer.alive,
      hasPowerup: serverPlayer.hasPowerup,
      hasRapidfire: serverPlayer.hasRapidfire,
      score: serverPlayer.score,
    };
    return;
  }

  const local = state.localPlayer;
  local.serverX = serverPlayer.x;
  local.serverY = serverPlayer.y;
  local.lastServerAt = now;
  local.alive = serverPlayer.alive;
  local.hasPowerup = serverPlayer.hasPowerup;
  local.hasRapidfire = serverPlayer.hasRapidfire;
  local.score = serverPlayer.score;
  if (!state.hasPointer && typeof serverPlayer.aim === 'number') {
    const serverAim = wrapAngle(serverPlayer.aim);
    local.angle = serverAim;
    local.targetAngle = serverAim;
  }

  // Snap aggressively if prediction diverged too far or player respawned
  const distance = Math.hypot((local.x ?? serverPlayer.x) - serverPlayer.x, (local.y ?? serverPlayer.y) - serverPlayer.y);
  const tolerance = serverPlayer.alive ? 120 : 12;
  if (distance > tolerance || !serverPlayer.alive) {
    local.x = serverPlayer.x;
    local.y = serverPlayer.y;
  }
}

function updateCombinedInput() {
  const baseAngle = state.hasPointer
    ? state.cursorAngle
    : state.localPlayer?.angle ?? state.cursorAngle ?? 0;
  let dirX = 0;
  let dirY = 0;

  if (Math.abs(state.thrustInput) > 0.01) {
    dirX += Math.cos(baseAngle) * state.thrustInput;
    dirY += Math.sin(baseAngle) * state.thrustInput;
  }

  const joystickMagnitude = Math.hypot(state.joystickDir.x, state.joystickDir.y);
  if (joystickMagnitude > 0.01) {
    dirX += state.joystickDir.x * joystickMagnitude;
    dirY += state.joystickDir.y * joystickMagnitude;
  }

  state.combinedDir = normalizeVector({ x: dirX, y: dirY });
}

function normalizeVector(vec) {
  const length = Math.hypot(vec.x, vec.y);
  if (!length) return { x: 0, y: 0 };
  return { x: vec.x / length, y: vec.y / length };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle) {
  const twoPi = Math.PI * 2;
  const wrapped = angle % twoPi;
  return wrapped < 0 ? wrapped + twoPi : wrapped;
}

function shortestAngleDiff(from, to) {
  let diff = wrapAngle(to) - wrapAngle(from);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function rotateTowards(current, target, maxDelta) {
  const diff = shortestAngleDiff(current, target);
  const clamped = clamp(diff, -maxDelta, maxDelta);
  return wrapAngle(current + clamped);
}

function limitVector(vec, max) {
  const length = Math.hypot(vec.x, vec.y);
  if (length <= max) return vec;
  return { x: (vec.x / length) * max, y: (vec.y / length) * max };
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
  state.screen = name;

  if (elements.effectLayer && name !== 'game') {
    clearEffectLayer();
  }
  
  // Hide timer when not in game screen
  if (name !== 'game') {
    hideRoomTimer();
  }

  // Start or stop tip rotation based on screen
  if (name === 'game') {
    startTipRotation();
    // Initialize target score display
    const target = state.config?.targetScore || 50;
    elements.targetScore.textContent = target;
    elements.currentScore.textContent = '0';
  } else {
    stopTipRotation();
  }

  // Show/hide room timer based on screen (only show during active game)
  if (name === 'game') {
    startRoomTimer();
  } else {
    hideRoomTimer();
  }
}

function buildJoinUrl(roomId, name) {
  const url = new URL(window.location.href);
  url.pathname = `/play/${roomId}`;
  if (name) {
    url.searchParams.set('name', name);
  }
  return url.toString();
}

function parseRoomId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase() === 'play');
    if (idx >= 0 && parts[idx + 1]) {
      return parts[idx + 1].toLowerCase();
    }
    if (parts.length) {
      return parts[parts.length - 1].toLowerCase();
    }
  } catch (err) {
    // Not a full URL, treat as ID
  }
  if (/^[a-f0-9]{8}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function connectSocket({ roomId, name, hostKey, passcode, spaceship }) {
  if (!roomId || !name) {
    showStatus('Missing room or name', true);
    return;
  }

  state.lastSentInput = null;
  state.lastInputSentAt = 0;

  if (state.ws) {
    state.ws.close(1000, 'Reconnecting');
    state.ws = null;
  }

  const socket = new WebSocket(wsUrl);
  state.ws = socket;

  socket.addEventListener('open', () => {
    sendMessage({
      type: 'join',
      roomId,
      name,
      hostKey,
      passcode,
      spaceship: spaceship || state.selectedSpaceship,
    });
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    } catch (err) {
      console.warn('Invalid message', err);
    }
  });

  socket.addEventListener('close', () => {
    if (state.ws === socket) {
      state.ws = null;
      elements.leaveGame.style.display = 'none';
      clearSession();
      showStatus('Connection closed', true);
    }
  });

  socket.addEventListener('error', () => {
    if (state.ws === socket) {
      showStatus('Network error', true);
    }
  });
}

function sendMessage(payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify(payload));
  state.messagesSent++;
}

function handleServerMessage(message) {
  // Track connection quality
  state.messagesReceived++;
  const now = performance.now();
  if (state.lastServerUpdate > 0) {
    const latency = now - state.lastServerUpdate;
    state.updateLatency.push(latency);
    // Keep only last 20 measurements
    if (state.updateLatency.length > 20) {
      state.updateLatency.shift();
    }
  }
  state.lastServerUpdate = now;
  
  switch (message.type) {
    case 'joined':
      state.playerId = message.playerId;
      state.isHost = message.isHost;
      state.config = message.state?.config || state.config;
      if (message.state?.id) {
        const selfPlayer = message.state.players?.find((p) => p.id === message.playerId);
        const displayName = selfPlayer?.name || elements.createName.value || elements.joinName.value;
        state.joinUrl = buildJoinUrl(message.state.id, displayName);
      }
      updateFromSerializedState(message.state);
      handleStateTransition(message.state);
      
      // Save session and show leave button
      saveSession();
      elements.leaveGame.style.display = 'block';
      
      // Show connected toast after everything is ready
      setTimeout(() => {
        showToast('Connected', 'success', 2000);
      }, 100);
      break;
    case 'lobby-update':
      updateFromSerializedState(message.state);
      // Only switch to lobby if not in an active game or results
      if (state.screen !== 'lobby' && state.screen !== 'game' && state.screen !== 'results') {
        showScreen('lobby');
      } else if (state.screen === 'lobby') {
        renderLobby();
      }
      // If in game/results, just update state silently without switching screens
      break;
    case 'match-start':
      updateFromSerializedState(message.state);
      state.resultsState = null;
      state.resultsConfirmed = false;
      showScreen('game');
      startRoomTimer(); // Start countdown when game starts
      renderHud();
      break;
    case 'player-joined':
      if (message.playerId !== state.playerId) {
        showToast(`${message.playerName} joined the match`, 'info', 3000);
        audio.playTone(550, 0.1, 0.08);
      }
      break;
    case 'state':
      updateFromSerializedState(message.state);
      renderHud();
      break;
    case 'match-end':
      updateFromSerializedState(message.state);
      state.resultsState = message.state;
      state.resultsState.winnerId = message.winnerId;
      state.resultsConfirmed = true;
      hideRoomTimer(); // Hide timer when match ends
      renderResults(message);
      showScreen('results');
      break;
    case 'host-change':
      if (message.playerId === state.playerId) {
        state.isHost = true;
        showToast('You are now the host', 'success', 3000);
      }
      break;
    case 'error':
      showStatus(message.message || 'Server error', true);
      if (
        elements.joinScreen &&
        elements.joinScreen.classList.contains('active') &&
        state.roomId
      ) {
        fetchRoomAvailability(state.roomId, { force: true });
      }
      break;
    default:
      break;
  }
}

function handleStateTransition(serialized) {
  const status = serialized?.state;
  if (status === 'lobby') {
    showScreen('lobby');
    renderLobby();
  } else if (status === 'running') {
    showScreen('game');
    renderHud();
  } else if (status === 'results') {
    state.resultsState = serialized;
    renderResults({ winnerId: serialized.winnerId, state: serialized });
    showScreen('results');
  }
}

function updateFromSerializedState(serialized) {
  if (!serialized) return;

  const previousPlayersArray = state.gameState?.players || [];
  const previousPlayers = new Map(previousPlayersArray.map((player) => [player.id, player]));
  const previousEnemiesArray = state.gameState?.enemies || [];
  const previousEnemies = new Map(previousEnemiesArray.map((enemy) => [enemy.id, enemy]));

  if (serialized.config) {
    state.config = serialized.config;
    state.roomTimeoutMinutes = serialized.config.roomTimeoutMinutes;
  }
  if (serialized.state && serialized.state !== 'running') {
    state.localPlayer = null;
  }
  if (serialized.gameStartedAt) {
    state.roomCreatedAt = serialized.gameStartedAt;
  }
  if (serialized.players) {
    state.lastLobbyState = serialized;
    updateTakenSpaceships(serialized.players);
  }
  if (serialized.state === 'running') {
    const newPlayers = serialized.players || [];

    newPlayers.forEach((player) => {
      const previous = previousPlayers.get(player.id);
      if (!player.alive) {
        player.dirX = 0;
        player.dirY = 0;
        player.displayAngle = 0;
        return;
      }
      
      // Store target position for interpolation
      player.targetX = player.x;
      player.targetY = player.y;
      
      // For non-local players, smoothly interpolate to the target position
      if (previous && player.id !== state.playerId) {
        const lerpFactor = 0.4; // Smoother interpolation: 40% towards target
        player.x = previous.x * (1 - lerpFactor) + player.targetX * lerpFactor;
        player.y = previous.y * (1 - lerpFactor) + player.targetY * lerpFactor;
      }
      
      const dx = player.targetX - (previous ? previous.x : player.x);
      const dy = player.targetY - (previous ? previous.y : player.y);
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 0.5) {
        const targetDirX = dx / magnitude;
        const targetDirY = dy / magnitude;
        
        // Smooth rotation interpolation
        if (previous && (previous.dirX || previous.dirY)) {
          const smoothing = 0.35; // 35% new direction, 65% old direction
          player.dirX = previous.dirX * (1 - smoothing) + targetDirX * smoothing;
          player.dirY = previous.dirY * (1 - smoothing) + targetDirY * smoothing;
          
          // Normalize
          const newMagnitude = Math.hypot(player.dirX, player.dirY);
          if (newMagnitude > 0) {
            player.dirX /= newMagnitude;
            player.dirY /= newMagnitude;
          }
        } else {
          player.dirX = targetDirX;
          player.dirY = targetDirY;
        }
        
        // Calculate display angle for rendering
        player.displayAngle = Math.atan2(player.dirY, player.dirX);
      } else {
        // Keep previous direction when not moving significantly
        if (previous && (previous.dirX || previous.dirY)) {
          player.dirX = previous.dirX;
          player.dirY = previous.dirY;
          player.displayAngle = previous.displayAngle || Math.atan2(previous.dirY, previous.dirX);
        } else {
          player.dirX = 0;
          player.dirY = 0;
          player.displayAngle = 0;
        }
      }

      if (typeof player.aim === 'number') {
        player.displayAngle = wrapAngle(player.aim);
      }
    });

    if (previousPlayersArray.length) {
      const newPlayerIds = new Set(newPlayers.map((player) => player.id));

      previousPlayersArray.forEach((oldPlayer) => {
        if (!newPlayerIds.has(oldPlayer.id)) {
          // Player left - start leave animation
          state.leavingPlayers.set(oldPlayer.id, {
            x: oldPlayer.x,
            y: oldPlayer.y,
            name: oldPlayer.name,
            startTime: Date.now(),
            animationDuration: 400, // 400ms animation
          });

          // Play leave sound effect (descending tone)
          if (oldPlayer.id !== state.playerId) {
            audio.playTone(400, 0.15, 0.1);
          }

          // Remove from animation list after animation completes
          setTimeout(() => {
            state.leavingPlayers.delete(oldPlayer.id);
          }, 450);
        }
      });
    }

    // Detect powerup usage (player had powerup, now doesn't)
    newPlayers.forEach((player) => {
      const previous = previousPlayers.get(player.id);
      if (previous && previous.hasPowerup && !player.hasPowerup) {
        state.powerupEffects.push({
          x: player.x,
          y: player.y,
          startTime: Date.now(),
          duration: 600,
        });

        audio.playTone(800, 0.2, 0.1);
        setTimeout(() => audio.playTone(600, 0.15, 0.1), 100);
      }
    });

    // Trigger death effects for players that just died
    newPlayers.forEach((player) => {
      const previous = previousPlayers.get(player.id);
      if (previous && previous.alive && !player.alive) {
        spawnDeathEffect(player.x, player.y, PLAYER_WORLD_RADIUS);
      }
      // Trigger respawn effects for players that just respawned
      if (previous && !previous.alive && player.alive) {
        state.respawnEffects.set(player.id, {
          x: player.x,
          y: player.y,
          startTime: Date.now(),
          duration: 1500, // 1.5 seconds blink/glow effect
        });
      }
    });

    // Trigger death effects for enemies that were killed or removed
    const newEnemies = serialized.enemies || [];
    const currentEnemies = new Map();

    newEnemies.forEach((enemy) => {
      const previous = previousEnemies.get(enemy.id);
      if (previous && previous.active && enemy.active === false) {
        spawnDeathEffect(enemy.x, enemy.y, ENEMY_WORLD_RADIUS);
      }
      if (enemy.active === false) {
        enemy.dirX = 0;
        enemy.dirY = 0;
      } else {
        // Store target position for interpolation
        enemy.targetX = enemy.x;
        enemy.targetY = enemy.y;
        
        // Interpolate position smoothly from previous to target
        if (previous && previous.x !== undefined) {
          const lerpFactor = 0.3; // 30% move towards target, 70% stay at current
          enemy.x = previous.x * (1 - lerpFactor) + enemy.targetX * lerpFactor;
          enemy.y = previous.y * (1 - lerpFactor) + enemy.targetY * lerpFactor;
        }
        
        const dx = enemy.targetX - (previous ? previous.x : enemy.x);
        const dy = enemy.targetY - (previous ? previous.y : enemy.y);
        const magnitude = Math.hypot(dx, dy);
        if (magnitude > 0.5) {
          // Smooth the direction change
          const newDirX = dx / magnitude;
          const newDirY = dy / magnitude;
          if (previous && previous.dirX !== undefined) {
            // Blend with previous direction for smoothness
            enemy.dirX = previous.dirX * 0.7 + newDirX * 0.3;
            enemy.dirY = previous.dirY * 0.7 + newDirY * 0.3;
            // Re-normalize
            const mag = Math.hypot(enemy.dirX, enemy.dirY);
            if (mag > 0) {
              enemy.dirX /= mag;
              enemy.dirY /= mag;
            }
          } else {
            enemy.dirX = newDirX;
            enemy.dirY = newDirY;
          }
        } else if (previous && previous.dirX !== undefined) {
          // Keep previous direction if barely moving
          enemy.dirX = previous.dirX;
          enemy.dirY = previous.dirY;
        } else {
          enemy.dirX = 0;
          enemy.dirY = 0;
        }
      }
      currentEnemies.set(enemy.id, enemy);
    });

    previousEnemies.forEach((enemy, id) => {
      if (!currentEnemies.has(id)) {
        spawnDeathEffect(enemy.x, enemy.y, ENEMY_WORLD_RADIUS);
      }
    });

    state.gameState = serialized;
    syncLocalPlayerFromServer(serialized);
  }
  if (serialized.state === 'results') {
    state.resultsState = serialized;
    state.localPlayer = null;
    state.resultsConfirmed = true;
  }
  if (serialized.targetScore) {
    state.config = { ...state.config, targetScore: serialized.targetScore };
  }
  updateScoreTracking(serialized.players || []);
}

function renderLobby() {
  if (!state.lastLobbyState) return;
  const { id, players, config } = state.lastLobbyState;
  elements.roomId.textContent = `Room: ${id}`;
  const passcodeLabel = config.passcodeEnabled ? 'Required' : 'Open';
  const penaltyLabel = config.deathPenaltyEnabled ? 'On' : 'Off';
  elements.roomConfig.textContent = `Target ${config.targetScore} pts · Max ${config.maxPlayers} players · Passcode ${passcodeLabel} · Death penalty ${penaltyLabel}`;
  elements.playerList.innerHTML = '';
  players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((player) => {
      const li = document.createElement('li');
      
      // Add spaceship icon if available
      if (player.spaceship) {
        const spaceshipIcon = document.createElement('img');
        spaceshipIcon.src = `/assets/players/player${player.spaceship}.webp`;
        spaceshipIcon.className = 'player-spaceship-icon';
        spaceshipIcon.alt = `Spaceship ${player.spaceship}`;
        li.appendChild(spaceshipIcon);
      }
      
      const name = document.createElement('span');
      name.textContent = player.name;
      if (player.id === state.playerId) {
        name.textContent += ' (You)';
      }
      const badge = document.createElement('span');
      if (player.isHost) {
        badge.textContent = 'Host';
        badge.className = 'badge';
      } else {
        badge.textContent = `${player.score || 0} pts`;
      }
      li.append(name, badge);
      elements.playerList.appendChild(li);
    });
  elements.startButton.disabled = !state.isHost || (players?.length || 0) < 1;
  elements.rematch.disabled = !state.isHost;
  
  // Update button text based on player count
  if (state.isHost && players?.length === 1) {
    elements.startButton.textContent = 'Play Solo';
  } else {
    elements.startButton.textContent = 'Start Game';
  }
}

function renderHud() {
  if (!state.gameState) return;
  const players = state.gameState.players || [];
  const sorted = players.slice().sort((a, b) => b.score - a.score);
  elements.scoreList.innerHTML = '';
  sorted.slice(0, 8).forEach((player) => {
    const li = document.createElement('li');
    
    // Add spaceship icon if available
    if (player.spaceship) {
      const spaceshipIcon = document.createElement('img');
      spaceshipIcon.src = `/assets/players/player${player.spaceship}.webp`;
      spaceshipIcon.className = 'player-spaceship-icon';
      spaceshipIcon.alt = `Spaceship ${player.spaceship}`;
      li.appendChild(spaceshipIcon);
    }
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${player.name}${player.id === state.playerId ? ' (You)' : ''}`;
    li.appendChild(nameSpan);
    
    const score = document.createElement('span');
    score.textContent = `${player.score} pts`;
    li.appendChild(score);
    elements.scoreList.appendChild(li);
  });

  const maxScore = sorted.length ? sorted[0].score : 0;
  const target = state.config?.targetScore || 50;
  const pct = Math.min(1, maxScore / target);
  elements.progressFill.style.width = `${pct * 100}%`;
  
  // Update score display in progress bar
  elements.currentScore.textContent = maxScore;
  elements.targetScore.textContent = target;
}

function renderResults(message) {
  const winnerId = message.winnerId || state.resultsState?.winnerId;
  const stateResults = message.state || state.resultsState;
  const timedOut = message.timedOut || false;
  if (!stateResults) return;
  
  // Display appropriate message
  if (timedOut) {
    elements.winnerAnnouncement.textContent = 'Time Out!';
  } else {
    const winner = stateResults.players?.find((p) => p.id === winnerId);
    elements.winnerAnnouncement.textContent = winner ? `${winner.name} wins!` : 'Match complete';
    
    // Trigger spectacular blast animation only for winners
    if (winner) {
      triggerWinnerBlastAnimation();
    }
  }
  elements.resultsList.innerHTML = '';
  const scores = stateResults.scores || stateResults.players || [];
  scores
    .slice()
    .sort((a, b) => b.score - a.score)
    .forEach((entry, index) => {
      const li = document.createElement('li');
      
      // Add spaceship icon if available
      if (entry.spaceship) {
        const spaceshipIcon = document.createElement('img');
        spaceshipIcon.src = `/assets/players/player${entry.spaceship}.webp`;
        spaceshipIcon.className = 'player-spaceship-icon';
        spaceshipIcon.alt = `Spaceship ${entry.spaceship}`;
        li.appendChild(spaceshipIcon);
      }
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${index + 1}. ${entry.name}${entry.id === state.playerId ? ' (You)' : ''}`;
      li.appendChild(nameSpan);
      
      const score = document.createElement('span');
      score.textContent = `${entry.score} pts`;
      li.appendChild(score);
      elements.resultsList.appendChild(li);
    });
  
  // Update rematch button based on host status
  elements.rematch.disabled = !state.isHost;
  if (state.isHost) {
    elements.rematch.textContent = 'Play Again';
    elements.rematch.title = '';
  } else {
    elements.rematch.textContent = 'Play Again (Host Only)';
    elements.rematch.title = 'Only the host can start a rematch';
  }
}

function showToast(message, type = 'info', duration = 4000) {
  if (!elements.toastContainer) return;

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  // Add to container
  elements.toastContainer.appendChild(toast);

  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300); // Match animation duration
    }, duration);
  }

  return toast;
}

// Backward compatibility wrapper
function showStatus(message, isError = false, timeout = 4000) {
  const type = isError ? 'error' : 'info';
  return showToast(message, type, timeout);
}

function triggerWinnerBlastAnimation() {
  const announcement = elements.winnerAnnouncement;
  if (!announcement) return;
  
  // Skip elaborate animations in low graphics mode
  if (state.lowGraphics) {
    announcement.classList.add('winner-blast-simple');
    setTimeout(() => {
      announcement.classList.remove('winner-blast-simple');
    }, 2000);
    return;
  }
  
  // Add blast animation class
  announcement.classList.add('winner-blast-active');
  
  // Create particle container
  const particleContainer = document.createElement('div');
  particleContainer.className = 'blast-particles-container';
  announcement.appendChild(particleContainer);
  
  // Create multiple bursts of particles
  const burstCount = 5;
  const particlesPerBurst = 30;
  
  for (let burst = 0; burst < burstCount; burst++) {
    setTimeout(() => {
      createParticleBurst(particleContainer, particlesPerBurst);
    }, burst * 300);
  }
  
  // Create continuous sparkles
  const sparkleInterval = setInterval(() => {
    createSparkle(particleContainer);
  }, 50);
  
  // Clean up after animation completes
  setTimeout(() => {
    announcement.classList.remove('winner-blast-active');
    clearInterval(sparkleInterval);
    if (particleContainer.parentNode) {
      particleContainer.remove();
    }
  }, 5000);
}

function createParticleBurst(container, count) {
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'blast-particle';
    
    const angle = (Math.PI * 2 * i) / count;
    const velocity = 150 + Math.random() * 200;
    const size = 4 + Math.random() * 8;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const rotation = Math.random() * 360;
    const duration = 1 + Math.random() * 1.5;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.background = color;
    particle.style.setProperty('--tx', `${Math.cos(angle) * velocity}px`);
    particle.style.setProperty('--ty', `${Math.sin(angle) * velocity}px`);
    particle.style.setProperty('--rotation', `${rotation}deg`);
    particle.style.animationDuration = `${duration}s`;
    
    // Add glow effect
    particle.style.boxShadow = `0 0 10px ${color}, 0 0 20px ${color}`;
    
    container.appendChild(particle);
    
    // Remove after animation
    setTimeout(() => {
      if (particle.parentNode) {
        particle.remove();
      }
    }, duration * 1000);
  }
}

function createSparkle(container) {
  const sparkle = document.createElement('div');
  sparkle.className = 'blast-sparkle';
  
  const x = -50 + Math.random() * 100;
  const y = -50 + Math.random() * 100;
  const size = 2 + Math.random() * 4;
  const colors = ['#FFD700', '#FFFFFF', '#FFF59D'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  sparkle.style.left = `calc(50% + ${x}%)`;
  sparkle.style.top = `calc(50% + ${y}%)`;
  sparkle.style.width = `${size}px`;
  sparkle.style.height = `${size}px`;
  sparkle.style.background = color;
  sparkle.style.boxShadow = `0 0 5px ${color}`;
  
  container.appendChild(sparkle);
  
  setTimeout(() => {
    if (sparkle.parentNode) {
      sparkle.remove();
    }
  }, 1000);
}

async function copyRoomLink() {
  if (!state.joinUrl) {
    showToast('No join link yet', 'error', 3000);
    return;
  }
  try {
    // Remove query parameters from the URL before copying
    const url = new URL(state.joinUrl);
    const cleanUrl = `${url.origin}${url.pathname}`;
    await navigator.clipboard.writeText(cleanUrl);
    showToast('Link copied!', 'success', 2000);
  } catch (err) {
    console.warn('Copy failed', err);
    showToast('Could not copy link', 'error', 3000);
  }
}

function updateScoreTracking(players) {
  players.forEach((player) => {
    const previous = state.lastScores.get(player.id) || 0;
    if (player.score > previous) {
      if (player.id === state.playerId) {
        const diff = player.score - previous;
        if (diff >= 2) {
          audio.playTone(440, 0.18, 0.18);
        } else {
          audio.playTone(660, 0.1, 0.12);
        }
      }
    }
    state.lastScores.set(player.id, player.score);
  });
}

setInterval(() => {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  if (!state.playerId) return;
  state.inputSeq += 1;
  const dir = state.combinedDir;
  const now = performance.now();
  const timeSinceLast = now - (state.lastInputSentAt || 0);
  const forceHeartbeat = timeSinceLast > 500; // Increased from 250ms to 500ms
  const payload = {
    type: 'input',
    seq: state.inputSeq,
    dir,
    action: state.pendingAction,
    powerup: state.pendingPowerup,
    aim: state.cursorAngle,
    thrust: state.thrustInput,
  };

  const last = state.lastSentInput;
  const sameDir = last && Math.abs(last.dir.x - dir.x) < 0.01 && Math.abs(last.dir.y - dir.y) < 0.01; // Increased threshold from 0.001 to 0.01
  const sameAim = last && Math.abs(shortestAngleDiff(last.aim, payload.aim)) < 0.02; // Increased threshold from 0.005 to 0.02
  const sameAction = !payload.action && !payload.powerup && last && !last.action && !last.powerup;

  if (forceHeartbeat || !sameDir || !sameAim || !sameAction) {
    state.lastSentInput = {
      dir: { x: dir.x, y: dir.y },
      aim: payload.aim,
      action: payload.action,
      powerup: payload.powerup,
    };
    state.lastInputSentAt = now;
    sendMessage(payload);
  } else if (payload.action || payload.powerup) {
    state.lastSentInput = {
      dir: { x: dir.x, y: dir.y },
      aim: payload.aim,
      action: payload.action,
      powerup: payload.powerup,
    };
    state.lastInputSentAt = now;
    sendMessage(payload);
  }

  state.pendingAction = false;
  state.pendingPowerup = false;
}, 75); // Increased from 50ms to 75ms (13.3 updates/sec instead of 20)

let lastFrameTimestamp = performance.now();

function draw(timestamp) {
  const deltaMs = timestamp - lastFrameTimestamp;
  lastFrameTimestamp = timestamp;
  requestAnimationFrame(draw);

  if (!state.gameState) {
    clearCanvas();
    return;
  }

  if (deltaMs < 200) {
    stepLocalPrediction(deltaMs);
  }

  renderGameScene(state.gameState, timestamp);
}

requestAnimationFrame(draw);

function clearCanvas() {
  const width = parseFloat(elements.canvas.style.width) || elements.canvas.width;
  const height = parseFloat(elements.canvas.style.height) || elements.canvas.height;
  ctx.fillStyle = '#0A0E13';
  ctx.fillRect(0, 0, width, height);
}

function renderGameScene(game, timestamp) {
  const width = parseFloat(elements.canvas.style.width) || elements.canvas.width;
  const height = parseFloat(elements.canvas.style.height) || elements.canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!state.lowGraphics) {
    drawBackdrop(width, height, timestamp);
  } else {
    ctx.fillStyle = '#0A0E13';
    ctx.fillRect(0, 0, width, height);
  }

  drawCoins(game.coins || []);
  drawPowerups(game.powerups || [], timestamp);
  drawRapidfires(game.rapidfires || [], timestamp);
  drawEnemies(game.enemies || []);
  drawBullets(game.bullets || [], timestamp);
  const renderPlayers = preparePlayersForRender(game.players || []);
  drawPlayers(renderPlayers, timestamp);
  drawPowerupEffects(timestamp);
  drawLeavingPlayers(timestamp);

  if (game.state === 'results') {
    ctx.fillStyle = 'rgba(10, 14, 19, 0.75)';
    ctx.fillRect(0, 0, width, height);
  }
}

function drawBackdrop(width, height, timestamp) {
  if (state.lowGraphics) {
    // Simple solid background for low graphics mode
    ctx.fillStyle = '#0A0E13';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  
  // Draw background image if loaded, otherwise fallback to dark background
  if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
    ctx.drawImage(backgroundImage, 0, 0, width, height);
  } else {
    // Base dark background
    ctx.fillStyle = '#0A0E13';
    ctx.fillRect(0, 0, width, height);

    // Animated grid pattern
    ctx.strokeStyle = 'rgba(63, 77, 94, 0.15)';
    ctx.lineWidth = 1.5;
    const gridSize = 60;
    const offset = (timestamp / 50) % gridSize;
    
    for (let x = -gridSize; x < width + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x + offset, 0);
      ctx.lineTo(x + offset, height);
      ctx.stroke();
    }
    for (let y = -gridSize; y < height + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y + offset);
      ctx.lineTo(width, y + offset);
      ctx.stroke();
    }

    // Crosshair intersections
    ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
    for (let x = 0; x < width; x += gridSize) {
      for (let y = 0; y < height; y += gridSize) {
        const actualX = (x + offset) % width;
        const actualY = (y + offset) % height;
        ctx.fillRect(actualX - 2, actualY - 2, 4, 4);
      }
    }

    // Border accent lines
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    ctx.strokeStyle = 'rgba(22, 163, 74, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, width - 8, height - 8);
  }
}

function drawCoins(coins) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  coins.forEach((coin) => {
    const x = coin.x * scaleX;
    const y = coin.y * scaleY;
    
    // Outer glow circle
    ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();

    // Main coin body
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Coin border
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner highlight
    ctx.fillStyle = '#FCD34D';
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPowerups(powerups, timestamp) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  powerups.forEach((powerup) => {
    const x = powerup.x * scaleX;
    const y = powerup.y * scaleY;
    
    // Pulsing animation
    const pulse = Math.sin(timestamp / 200) * 0.3 + 1;
    const radius = 11 * pulse;
    
    // Outer energy ring
    if (!state.lowGraphics) {
      ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y, radius + 9, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Main powerup body - star shape
    ctx.fillStyle = '#A855F7';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 + timestamp / 1000;
      const r = i % 2 === 0 ? radius : radius * 0.5;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    
    // Border
    ctx.strokeStyle = '#7C3AED';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Inner core
    ctx.fillStyle = '#C084FC';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Bright center
    ctx.fillStyle = '#E9D5FF';
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawRapidfires(rapidfires, timestamp) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  rapidfires.forEach((rapidfire) => {
    const x = rapidfire.x * scaleX;
    const y = rapidfire.y * scaleY;
    
    // Pulsing animation (faster than powerups)
    const pulse = Math.sin(timestamp / 150) * 0.4 + 1;
    const radius = 12 * pulse;
    
    // Outer energy ring - orange/red glow
    if (!state.lowGraphics) {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Main rapidfire body - double chevron/arrow shape pointing outward
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(timestamp / 500); // Spin faster than powerups
    
    // Draw three arrows pointing outward
    for (let a = 0; a < 3; a++) {
      ctx.save();
      ctx.rotate((a * Math.PI * 2) / 3);
      
      // Arrow body
      ctx.fillStyle = '#FB923C';
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.3);
      ctx.lineTo(radius * 0.5, -radius * 0.3);
      ctx.lineTo(radius * 0.8, 0);
      ctx.lineTo(radius * 0.5, radius * 0.3);
      ctx.lineTo(0, radius * 0.3);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
    
    ctx.restore();
    
    // Center circle
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    
    // Border on center
    ctx.strokeStyle = '#EA580C';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Bright center highlight
    ctx.fillStyle = '#FED7AA';
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, radius * 0.15, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBullets(bullets, timestamp) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  
  bullets.forEach((bullet) => {
    const x = bullet.x * scaleX;
    const y = bullet.y * scaleY;
    
    // Calculate bullet direction for gradient
    const speed = Math.hypot(bullet.vx, bullet.vy);
    const dirX = bullet.vx / speed;
    const dirY = bullet.vy / speed;
    
    // Bullet size
    const radius = 5;
    const tailLength = 15;
    
    // Draw bullet tail (trail effect)
    if (!state.lowGraphics) {
      const gradient = ctx.createLinearGradient(
        x - dirX * tailLength, 
        y - dirY * tailLength,
        x,
        y
      );
      gradient.addColorStop(0, 'rgba(251, 146, 60, 0)');
      gradient.addColorStop(0.5, 'rgba(251, 146, 60, 0.6)');
      gradient.addColorStop(1, 'rgba(249, 115, 22, 1)');
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - dirX * tailLength, y - dirY * tailLength);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    
    // Draw bullet body with gradient
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(0.3, '#FED7AA');
    gradient.addColorStop(0.6, '#FB923C');
    gradient.addColorStop(1, '#F97316');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Outer glow
    if (!state.lowGraphics) {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Bright center highlight
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x - 1, y - 1, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Draw a small triangular pointer indicating an entity's movement direction.
function drawDirectionNotch(x, y, radius, dirX, dirY, options = {}) {
  const magnitude = Math.hypot(dirX, dirY);
  if (magnitude < 0.01) return;

  const {
    fill = '#FFFFFF',
    stroke = '#1E293B',
    tipOffset = 8,
    baseOffset = 0,
    halfWidth = 4,
    lineWidth = 1.25,
  } = options;

  const nx = dirX / magnitude;
  const ny = dirY / magnitude;
  const baseDistance = radius + baseOffset;
  const tipDistance = radius + tipOffset;
  const baseX = x + nx * baseDistance;
  const baseY = y + ny * baseDistance;
  const tipX = x + nx * tipDistance;
  const tipY = y + ny * tipDistance;
  const perpX = -ny;
  const perpY = nx;
  const leftX = baseX + perpX * halfWidth;
  const leftY = baseY + perpY * halfWidth;
  const rightX = baseX - perpX * halfWidth;
  const rightY = baseY - perpY * halfWidth;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawEnemies(enemies) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  enemies.forEach((enemy) => {
    const x = enemy.x * scaleX;
    const y = enemy.y * scaleY;
    
    if (enemy.active === false) {
      // Defeated enemy
      if (enemyImage && enemyImage.complete) {
        const size = 24; // Small defeated size (maintains aspect ratio)
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.filter = 'grayscale(100%)';
        ctx.translate(x, y);
        ctx.drawImage(enemyImage, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        // Fallback circle
        ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    } else {
      // Draw fire tail for active enemies if moving
      const isMoving = Math.hypot(enemy.dirX || 0, enemy.dirY || 0) > 0.01;
      if (isMoving && !state.lowGraphics) {
        drawFireTail(x, y, enemy.dirX || 0, enemy.dirY || 0, 20, Date.now());
      }
      
      // Active enemy with spaceship image
      if (enemyImage && enemyImage.complete) {
        const size = 40; // Enemy image size (maintains aspect ratio)
        const angle = (enemy.dirX || enemy.dirY) ? Math.atan2(enemy.dirY || 0, enemy.dirX || 0) : 0;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2); // Rotate to face direction (add 90deg because image faces up)
        
        ctx.drawImage(enemyImage, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        // Fallback to original colored circle design
        if (!state.lowGraphics) {
          ctx.fillStyle = 'rgba(225, 29, 72, 0.15)';
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.fill();
        }

        // Main enemy body
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();

        // Enemy border
        ctx.strokeStyle = '#991B1B';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner core
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(x, y, 7.5, 0, Math.PI * 2);
        ctx.fill();

        // Bright center
        ctx.fillStyle = '#FCA5A5';
        ctx.beginPath();
        ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2);
        ctx.fill();

        drawDirectionNotch(x, y, 12, enemy.dirX ?? 0, enemy.dirY ?? 0, {
          fill: '#F87171',
          stroke: '#7F1D1D',
          tipOffset: 8,
          halfWidth: 4,
          lineWidth: 1.4,
        });
      }
    }
  });
}

function drawFireTail(x, y, dirX, dirY, radius, timestamp) {
  const magnitude = Math.hypot(dirX, dirY);
  if (magnitude < 0.01) return;
  
  // Normalize direction
  const nx = dirX / magnitude;
  const ny = dirY / magnitude;
  
  // Fire tail parameters
  const tailLength = radius * 2.5;
  const tailWidth = radius * 0.8;
  
  // Animated flicker effect
  const flicker1 = Math.sin(timestamp * 0.01) * 0.2 + 0.8;
  const flicker2 = Math.sin(timestamp * 0.015 + 1) * 0.15 + 0.85;
  
  // Start position (more inside the ship)
  const startX = x - nx * radius * 0.8;
  const startY = y - ny * radius * 0.8;
  
  // End position (tail end)
  const endX = startX - nx * tailLength * flicker1;
  const endY = startY - ny * tailLength * flicker1;
  
  // Perpendicular vector for width
  const perpX = -ny;
  const perpY = nx;
  
  ctx.save();
  
  // Outer flame (red-orange)
  const gradient1 = ctx.createLinearGradient(startX, startY, endX, endY);
  gradient1.addColorStop(0, `rgba(255, 69, 0, ${0.8 * flicker1})`); // Red-orange
  gradient1.addColorStop(0.5, `rgba(255, 140, 0, ${0.5 * flicker2})`); // Dark orange
  gradient1.addColorStop(1, 'rgba(255, 69, 0, 0)'); // Fade to transparent
  
  ctx.fillStyle = gradient1;
  ctx.beginPath();
  ctx.moveTo(startX + perpX * tailWidth * 0.3, startY + perpY * tailWidth * 0.3);
  ctx.lineTo(startX - perpX * tailWidth * 0.3, startY - perpY * tailWidth * 0.3);
  ctx.lineTo(endX, endY);
  ctx.closePath();
  ctx.fill();
  
  // Middle flame (orange-yellow)
  const gradient2 = ctx.createLinearGradient(startX, startY, endX, endY);
  gradient2.addColorStop(0, `rgba(255, 165, 0, ${0.9 * flicker2})`); // Orange
  gradient2.addColorStop(0.4, `rgba(255, 215, 0, ${0.6 * flicker1})`); // Gold
  gradient2.addColorStop(1, 'rgba(255, 165, 0, 0)'); // Fade to transparent
  
  const midLength = tailLength * 0.7 * flicker2;
  const midEndX = startX - nx * midLength;
  const midEndY = startY - ny * midLength;
  
  ctx.fillStyle = gradient2;
  ctx.beginPath();
  ctx.moveTo(startX + perpX * tailWidth * 0.2, startY + perpY * tailWidth * 0.2);
  ctx.lineTo(startX - perpX * tailWidth * 0.2, startY - perpY * tailWidth * 0.2);
  ctx.lineTo(midEndX, midEndY);
  ctx.closePath();
  ctx.fill();
  
  // Inner core (bright yellow-white)
  const gradient3 = ctx.createLinearGradient(startX, startY, endX, endY);
  gradient3.addColorStop(0, `rgba(255, 255, 200, ${0.95 * flicker1})`); // Bright yellow-white
  gradient3.addColorStop(0.3, `rgba(255, 255, 100, ${0.7 * flicker2})`); // Yellow
  gradient3.addColorStop(1, 'rgba(255, 255, 0, 0)'); // Fade to transparent
  
  const coreLength = tailLength * 0.4 * flicker1;
  const coreEndX = startX - nx * coreLength;
  const coreEndY = startY - ny * coreLength;
  
  ctx.fillStyle = gradient3;
  ctx.beginPath();
  ctx.moveTo(startX + perpX * tailWidth * 0.1, startY + perpY * tailWidth * 0.1);
  ctx.lineTo(startX - perpX * tailWidth * 0.1, startY - perpY * tailWidth * 0.1);
  ctx.lineTo(coreEndX, coreEndY);
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
}

// Merge predicted local state into the render list without mutating the server snapshot.
function preparePlayersForRender(players) {
  if (!state.localPlayer) return players;
  const local = state.localPlayer;
  return players.map((player) => {
    if (player.id !== local.id) return player;
    return {
      ...player,
      x: local.x,
      y: local.y,
      displayAngle: local.angle,
      renderAngle: local.angle,
      dirX: state.combinedDir?.x ?? 0,
      dirY: state.combinedDir?.y ?? 0,
      aim: local.angle,
    };
  });
}

function drawPlayers(players, timestamp) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  players.forEach((player) => {
    const x = player.x * scaleX;
    const y = player.y * scaleY;
    const isSelf = player.id === state.playerId;
    const radius = isSelf ? 13 : 12;

    if (!player.alive) {
      // Dead player - draw faded spaceship
      const spaceshipImg = spaceshipImages[player.spaceship];
      if (spaceshipImg && spaceshipImg.complete) {
        const size = radius * 3;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.filter = 'grayscale(100%)';
        ctx.translate(x, y);
        ctx.drawImage(spaceshipImg, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        // Fallback circle
        ctx.fillStyle = 'rgba(31, 41, 55, 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Draw fire tail if moving
      let isMoving = false;
      let fireDirX = 0;
      let fireDirY = 0;
      
      if (isSelf) {
        // For current player, use actual input state
        isMoving = Math.hypot(state.combinedDir.x, state.combinedDir.y) > 0.01;
        fireDirX = state.combinedDir.x;
        fireDirY = state.combinedDir.y;
      } else {
        // For other players, use their direction from server
        isMoving = Math.hypot(player.dirX || 0, player.dirY || 0) > 0.01;
        fireDirX = player.dirX || 0;
        fireDirY = player.dirY || 0;
      }
      
      if (isMoving && !state.lowGraphics) {
        drawFireTail(x, y, fireDirX, fireDirY, radius, timestamp);
      }
      // Respawn effect - blinking and glowing
      const respawnEffect = state.respawnEffects.get(player.id);
      let showPlayer = true; // For blink effect
      let glowIntensity = 0;
      
      if (respawnEffect) {
        const elapsed = Date.now() - respawnEffect.startTime;
        if (elapsed >= respawnEffect.duration) {
          state.respawnEffects.delete(player.id);
        } else {
          const progress = elapsed / respawnEffect.duration;
          // Blink effect - faster at start, slower at end
          const blinkFrequency = 12 - (progress * 10); // 12Hz to 2Hz
          showPlayer = Math.sin(elapsed * blinkFrequency * Math.PI / 100) > 0;
          
          // Glow intensity - strong at start, fades out
          glowIntensity = 1 - progress;
          
          // Glowing aura around player
          if (!state.lowGraphics && glowIntensity > 0) {
            const gradient = ctx.createRadialGradient(x, y, radius, x, y, radius + 20);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${glowIntensity * 0.6})`);
            gradient.addColorStop(0.5, `rgba(34, 211, 238, ${glowIntensity * 0.4})`);
            gradient.addColorStop(1, 'rgba(34, 211, 238, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius + 20, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      
      // Dashing effect
      if (!state.lowGraphics && player.dashing) {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Only draw player if visible in blink cycle
      if (!showPlayer) {
        // Skip drawing the player body during blink-off phase
        // But still show a faint outline
        if (respawnEffect) {
          ctx.strokeStyle = isSelf ? 'rgba(22, 163, 74, 0.3)' : 'rgba(14, 165, 233, 0.3)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Draw spaceship image
  const spaceshipImg = player.spaceship ? spaceshipImages[player.spaceship] : null;
        if (spaceshipImg && spaceshipImg.complete) {
          const size = radius * 3; // Image size
          const angleSource =
            player.renderAngle !== undefined ? player.renderAngle :
            player.displayAngle !== undefined ? player.displayAngle :
            (player.dirX || player.dirY ? Math.atan2(player.dirY || 0, player.dirX || 0) : 0);
          const angle = angleSource;
          
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle + Math.PI / 2); // Rotate to face direction (add 90deg because image faces up)
          
          ctx.drawImage(spaceshipImg, -size / 2, -size / 2, size, size);
          ctx.restore();
          
          // Self indicator ring
          if (isSelf) {
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, radius * 2 + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          // Fallback to colored circle if image not loaded or no spaceship
          ctx.fillStyle = isSelf ? '#16A34A' : '#0EA5E9';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Border
          ctx.strokeStyle = isSelf ? '#15803D' : '#0369A1';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Self indicator
          if (isSelf) {
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      
        // Powerup indicator - purple aura
        if (player.hasPowerup) {
          ctx.strokeStyle = '#A855F7';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, radius * 2 + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        // Rapid-fire indicator - orange/red spinning aura
        if (player.hasRapidfire) {
          // Spinning arrows around player
          ctx.save();
          ctx.translate(x, y);
          const spinAngle = (Date.now() / 300) % (Math.PI * 2); // Fast spin
          ctx.rotate(spinAngle);
          
          for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI) / 2);
            
            // Draw small arrow
            ctx.fillStyle = '#FB923C';
            ctx.beginPath();
            ctx.moveTo(0, -(radius * 2 + 8));
            ctx.lineTo(-4, -(radius * 2 + 4));
            ctx.lineTo(0, -(radius * 2 + 10));
            ctx.lineTo(4, -(radius * 2 + 4));
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
          }
          
          ctx.restore();
          
          ctx.strokeStyle = '#F97316';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(x, y, radius * 2 + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Player name with background
    ctx.fillStyle = 'rgba(10, 14, 19, 0.8)';
    ctx.font = '13px "Product Sans", sans-serif';
    const textWidth = ctx.measureText(player.name).width;
    const labelX = x - textWidth / 2 - 6;
    const labelY = y - 50;
    const labelWidth = textWidth + 12;
    const labelHeight = 18;
    const borderRadius = 10;
    
    // Draw rounded rectangle background
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelWidth, labelHeight, borderRadius);
    ctx.fill();

    // Draw rounded rectangle border
    ctx.strokeStyle = isSelf ? '#F59E0B' : '#3F4D5E';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = isSelf ? '#FBBF24' : '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name, x, y - 41);
  });
}

function drawPowerupEffects(timestamp) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  
  // Clean up old effects and draw active ones
  state.powerupEffects = state.powerupEffects.filter(effect => {
    const elapsed = timestamp - effect.startTime;
    if (elapsed >= effect.duration) {
      return false; // Remove completed effect
    }
    
    const progress = elapsed / effect.duration;
    const x = effect.x * scaleX;
    const y = effect.y * scaleY;
    
    if (state.lowGraphics) {
      // Simple circle flash for low graphics mode
      const opacity = (1 - progress) * 0.8;
      ctx.fillStyle = `rgba(168, 85, 247, ${opacity})`;
      ctx.beginPath();
      ctx.arc(x, y, 50 * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
      return true;
    }
    
    // Full effect for normal graphics mode
    // Expanding ring effect
    const maxRadius = 200; // Match POWERUP_KILL_RADIUS from server
    const radius = maxRadius * progress;
    const opacity = 1 - progress;
    
    // Outer explosion ring
    ctx.strokeStyle = `rgba(168, 85, 247, ${opacity * 0.8})`;
    ctx.lineWidth = 8 * (1 - progress * 0.7);
    ctx.beginPath();
    ctx.arc(x, y, radius * scaleX, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner explosion ring
    ctx.strokeStyle = `rgba(192, 132, 252, ${opacity * 0.6})`;
    ctx.lineWidth = 6 * (1 - progress * 0.7);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.7 * scaleX, 0, Math.PI * 2);
    ctx.stroke();
    
    // Flash at center
    if (progress < 0.3) {
      ctx.fillStyle = `rgba(233, 213, 255, ${(1 - progress / 0.3) * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, 30 * (1 - progress / 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Particles
    if (!state.lowGraphics) {
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI * 2) / 12;
        const particleRadius = radius * 0.9;
        const px = x + Math.cos(angle) * particleRadius * scaleX;
        const py = y + Math.sin(angle) * particleRadius * scaleY;
        
        ctx.fillStyle = `rgba(168, 85, 247, ${opacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(px, py, 5 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    return true; // Keep effect
  });
}

function spawnDeathEffect(worldX, worldY, worldRadius) {
  const layer = elements.effectLayer;
  if (!layer) return;

  const layerWidth = layer.clientWidth || elements.canvas.clientWidth || elements.canvas.width;
  const layerHeight = layer.clientHeight || elements.canvas.clientHeight || elements.canvas.height;

  if (!layerWidth || !layerHeight) return;

  const scaleX = layerWidth / WORLD_WIDTH;
  const scaleY = layerHeight / WORLD_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  const effectSize = Math.max(100, Math.round((worldRadius * 8.5) * scale));
  const effect = document.createElement('img');
  effect.src = assets.blast;
  effect.alt = '';
  effect.className = 'death-effect';
  effect.style.left = `${(worldX / WORLD_WIDTH) * layerWidth}px`;
  effect.style.top = `${(worldY / WORLD_HEIGHT) * layerHeight}px`;
  effect.style.width = `${effectSize}px`;
  effect.style.height = `${effectSize}px`;

  layer.appendChild(effect);

  setTimeout(() => {
    effect.classList.add('fade-out');
  }, Math.max(0, BLAST_EFFECT_DURATION - 200));

  setTimeout(() => {
    if (effect.parentNode === layer) {
      layer.removeChild(effect);
    }
  }, BLAST_EFFECT_DURATION);
}

function clearEffectLayer() {
  if (elements.effectLayer) {
    elements.effectLayer.innerHTML = '';
  }
}

function drawLeavingPlayers(timestamp) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  
  state.leavingPlayers.forEach((leaving, playerId) => {
    // Safety checks
    if (!leaving || !leaving.startTime || !leaving.animationDuration) {
      state.leavingPlayers.delete(playerId);
      return;
    }
    
    const elapsed = timestamp - leaving.startTime;
    const progress = Math.min(Math.max(0, elapsed / leaving.animationDuration), 1);
    
    // Easing function for smooth pop-out
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    const x = leaving.x * scaleX;
    const y = leaving.y * scaleY;
    
    // Scale effect - grows then shrinks (ensure it never goes below 0.1)
    let scale;
    if (progress < 0.3) {
      scale = 1 + progress * 0.5; // 1.0 to 1.15
    } else {
      scale = Math.max(0.1, 1.15 - (progress - 0.3) * 1.5); // 1.15 to 0.1
    }
    const radius = Math.max(1, 18 * scale); // Ensure radius is always positive
    
    // Fade out
    const alpha = Math.max(0, 1 - easeOut);
    
    // Pop-out with expanding circle
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Outer ring (expanding)
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius * (1 + progress * 2), 0, Math.PI * 2);
    ctx.stroke();
    
    // Player body
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // X mark
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 3;
    const crossSize = radius * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - crossSize, y - crossSize);
    ctx.lineTo(x + crossSize, y + crossSize);
    ctx.moveTo(x + crossSize, y - crossSize);
    ctx.lineTo(x - crossSize, y + crossSize);
    ctx.stroke();
    
    // Name fading out
    ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`;
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(leaving.name, x, y - radius - 8);
    
    ctx.restore();
  });
}

function canvasScaleX() {
  const displayWidth = parseFloat(elements.canvas.style.width) || elements.canvas.width;
  return displayWidth / WORLD_WIDTH;
}

function canvasScaleY() {
  const displayHeight = parseFloat(elements.canvas.style.height) || elements.canvas.height;
  return displayHeight / WORLD_HEIGHT;
}

window.addEventListener('resize', () => resizeCanvas(), { passive: true });
resizeCanvas();

function resizeCanvas() {
  const isInFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || 
                            document.mozFullScreenElement || document.msFullscreenElement);
  
  let containerWidth, containerHeight;
  
  if (isInFullscreen) {
    // Use full viewport in fullscreen mode
    containerWidth = window.innerWidth;
    containerHeight = window.innerHeight;
  } else {
    // Normal mode - use constrained dimensions
    containerWidth = Math.min(window.innerWidth - 32, 960);
    containerHeight = Math.min(window.innerHeight - 220, 540);
  }
  
  const ratio = 1600 / 900;
  let width = containerWidth;
  let height = width / ratio;
  if (height > containerHeight) {
    height = containerHeight;
    width = height * ratio;
  }
  
  if (!isInFullscreen) {
    width = Math.max(640, Math.floor(width));
    height = Math.max(360, Math.floor(height));
  } else {
    width = Math.floor(width);
    height = Math.floor(height);
  }
  
  // Set display size (CSS pixels)
  elements.canvas.style.width = width + 'px';
  elements.canvas.style.height = height + 'px';
  
  // Set actual size in memory
  // In low graphics mode, render at 50% resolution then scale up
  const resolutionScale = state.lowGraphics ? 0.5 : 1;
  const dpr = (window.devicePixelRatio || 1) * resolutionScale;
  elements.canvas.width = width * dpr;
  elements.canvas.height = height * dpr;
  
  // Scale the context to maintain proper coordinate system
  ctx.scale(dpr, dpr);
  
  // Apply rendering quality settings
  if (state.lowGraphics) {
    ctx.imageSmoothingEnabled = false;
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
}

function updateFromDeepLink() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const idx = pathParts.findIndex((part) => part.toLowerCase() === 'play');
  if (idx >= 0 && pathParts[idx + 1]) {
    const roomId = pathParts[idx + 1];
    cachedCreateSelection = state.selectedSpaceship;
    state.takenSpaceships.clear();
    state.lastFetchedRoomId = null;
    state.lastRoomFetchTimestamp = 0;
    cachedJoinSelection = null;
    state.selectedSpaceship = null;
    elements.joinSpaceship.value = '';
    showScreen('join');
    renderSpaceshipGrid(elements.joinSpaceshipGrid, elements.joinSpaceship);
    elements.joinLink.value = buildJoinUrl(roomId, '');
    scheduleRoomAvailabilityFetch(elements.joinLink.value);
    const nameParam = new URLSearchParams(window.location.search).get('name');
    if (nameParam) {
      elements.joinName.value = nameParam.slice(0, 16);
    }
  }
}

function tryRestoreSession() {
  const session = loadSession();
  if (!session) return false;
  
  // Restore state
  state.roomId = session.roomId;
  state.playerId = session.playerId;
  state.isHost = session.isHost;
  state.hostKey = session.hostKey;
  state.passcode = session.passcode;
  state.joinUrl = session.joinUrl;
  state.selectedSpaceship = session.spaceship;
  
  // Show leave button
  elements.leaveGame.style.display = 'block';
  
  // Get display name from session or use a default
  const displayName = session.joinUrl ? 
    new URLSearchParams(new URL(session.joinUrl).search).get('name') || 'Player' : 
    'Player';
  
  // Reconnect
  showStatus('Reconnecting...');
  connectSocket({
    roomId: session.roomId,
    name: displayName,
    hostKey: session.hostKey,
    passcode: session.passcode,
    spaceship: session.spaceship
  });
  
  return true;
}

// Try to restore session first, then check deep link
if (!tryRestoreSession()) {
  updateFromDeepLink();
}

function resizeObserverFallback() {
  resizeCanvas();
}

window.addEventListener('orientationchange', resizeObserverFallback);

// Fullscreen functionality
let isFullscreen = false;

function updateFullscreenButton() {
  const maximizeIcon = elements.fullscreenToggle.querySelector('.maximize-icon');
  const minimizeIcon = elements.fullscreenToggle.querySelector('.minimize-icon');
  
  if (isFullscreen) {
    maximizeIcon.style.display = 'none';
    minimizeIcon.style.display = 'block';
  } else {
    maximizeIcon.style.display = 'block';
    minimizeIcon.style.display = 'none';
  }
}

function updateFullscreenProgress() {
  if (isFullscreen && state.gameState) {
    elements.fullscreenProgress.style.display = 'block';
    elements.fullscreenScoreboard.style.display = 'block';
    
    // Update progress bar and scores to match the main HUD
    const players = state.gameState.players || [];
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    const maxScore = sorted.length ? sorted[0].score : 0;
    const targetScore = state.config?.targetScore || 50;
    const progress = Math.min((maxScore / targetScore) * 100, 100);
    
    elements.fullscreenProgressFill.style.width = progress + '%';
    elements.fullscreenCurrentScore.textContent = maxScore;
    elements.fullscreenTargetScore.textContent = targetScore;
    
    // Update scoreboard with all players except the current player
    elements.fullscreenScoreList.innerHTML = '';
    sorted.forEach((player) => {
      // Skip the current player since their score is shown in the progress bar on the right
      if (player.id === state.playerId) return;
      
      const li = document.createElement('li');
      
      // Add spaceship icon
      if (player.spaceship) {
        const spaceshipIcon = document.createElement('img');
        spaceshipIcon.src = `/assets/players/player${player.spaceship}.webp`;
        spaceshipIcon.className = 'player-spaceship-icon';
        spaceshipIcon.alt = `Spaceship ${player.spaceship}`;
        li.appendChild(spaceshipIcon);
      }
      
      // Add score
      const score = document.createElement('span');
      score.className = 'score-value';
      score.textContent = `${player.score} pts`;
      li.appendChild(score);
      
      elements.fullscreenScoreList.appendChild(li);
    });
  } else {
    elements.fullscreenProgress.style.display = 'none';
    elements.fullscreenScoreboard.style.display = 'none';
  }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && 
        !document.mozFullScreenElement && !document.msFullscreenElement) {
      // Enter fullscreen
      const wrapper = elements.canvasWrapper;
      if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
      } else if (wrapper.webkitRequestFullscreen) {
        await wrapper.webkitRequestFullscreen();
      } else if (wrapper.mozRequestFullScreen) {
        await wrapper.mozRequestFullScreen();
      } else if (wrapper.msRequestFullscreen) {
        await wrapper.msRequestFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
    }
  } catch (error) {
    console.error('Fullscreen toggle error:', error);
  }
}

function handleFullscreenChange() {
  isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || 
                    document.mozFullScreenElement || document.msFullscreenElement);
  updateFullscreenButton();
  updateFullscreenProgress();
  resizeCanvas();
}

// Set up fullscreen event listeners
elements.fullscreenToggle.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

function renderLoopTicker() {
  if (state.gameState) {
    renderHud();
    updateFullscreenProgress();
  }
  requestAnimationFrame(renderLoopTicker);
}

requestAnimationFrame(renderLoopTicker);
