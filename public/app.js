const screens = {
  splash: document.getElementById('splash-screen'),
  create: document.getElementById('create-screen'),
  join: document.getElementById('join-screen'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen'),
  results: document.getElementById('results-screen'),
};

const elements = {
  status: document.getElementById('status-banner'),
  createForm: document.getElementById('create-form'),
  createName: document.getElementById('create-name'),
  createTarget: document.getElementById('create-target'),
  createMax: document.getElementById('create-max'),
  createPasscode: document.getElementById('create-passcode'),
  createPasscodeEnabled: document.getElementById('create-passcode-enabled'),
  createDeathPenalty: document.getElementById('create-death-penalty'),
  createTimeout: document.getElementById('create-timeout'),
  joinForm: document.getElementById('join-form'),
  joinLink: document.getElementById('join-link'),
  joinName: document.getElementById('join-name'),
  joinPasscode: document.getElementById('join-passcode'),
  playerList: document.getElementById('player-list'),
  roomId: document.getElementById('room-id'),
  roomConfig: document.getElementById('room-config'),
  copyLink: document.getElementById('copy-link'),
  startButton: document.getElementById('start-game'),
  scoreList: document.getElementById('score-list'),
  progressFill: document.getElementById('progress-fill'),
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
  leaveGame: document.getElementById('leave-game'),
};

const ctx = elements.canvas.getContext('2d', { 
  alpha: false,
  desynchronized: true,
  willReadFrequently: false 
});

// Enable smooth rendering
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${location.host}`;

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
  config: null,
  lowGraphics: false,
  muted: false,
  inputSeq: 0,
  pendingAction: false,
  keyboardDir: { x: 0, y: 0 },
  joystickDir: { x: 0, y: 0 },
  combinedDir: { x: 0, y: 0 },
  lastScores: new Map(),
  scoreHistory: new Map(),
  leavingPlayers: new Map(), // playerId -> { x, y, startTime, animationTime }
};

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
  showStatus(state.muted ? 'Audio muted' : 'Audio on');
});

elements.graphicsToggle.addEventListener('click', () => {
  state.lowGraphics = !state.lowGraphics;
  elements.graphicsToggle.textContent = `Low Graphics: ${state.lowGraphics ? 'On' : 'Off'}`;
  showStatus(state.lowGraphics ? 'Low graphics enabled' : 'Low graphics disabled');
});

document.querySelectorAll('button[data-nav="splash"]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen('splash'));
});

elements.splashCreate.addEventListener('click', () => {
  showScreen('create');
  elements.createName.focus();
});

elements.splashJoin.addEventListener('click', () => {
  showScreen('join');
  elements.joinLink.focus();
});

elements.createPasscodeEnabled.addEventListener('change', (event) => {
  const enabled = event.target.checked;
  elements.createPasscode.disabled = !enabled;
  if (!enabled) {
    elements.createPasscode.value = '';
  }
});

elements.createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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
  state.roomId = roomId;
  state.hostKey = null;
  state.joinUrl = buildJoinUrl(roomId, elements.joinName.value);
  state.passcode = elements.joinPasscode.value || null;
  showStatus('Joining room…');
  connectSocket({
    roomId,
    name: elements.joinName.value,
    passcode: state.passcode,
  });
});

elements.copyLink.addEventListener('click', () => copyRoomLink());
elements.resultsCopyLink.addEventListener('click', () => copyRoomLink());

elements.startButton.addEventListener('click', () => {
  if (!state.isHost || !state.ws) return;
  sendMessage({ type: 'start' });
});

elements.rematch.addEventListener('click', () => {
  if (!state.isHost || !state.ws) return;
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
  
  // Hide leave button
  elements.leaveGame.style.display = 'none';
  
  // Go to splash screen
  showScreen('splash');
  showStatus('Left the game');
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
    state.keyboardDir = { x: 0, y: 0 };
    updateCombinedInput();
  }
});

const keyMap = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

const heldKeys = new Set();

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'Space') {
    queueAction();
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

function queueAction() {
  state.pendingAction = true;
}

function updateKeyboardDir() {
  const dir = { x: 0, y: 0 };
  if (heldKeys.has('left')) dir.x -= 1;
  if (heldKeys.has('right')) dir.x += 1;
  if (heldKeys.has('up')) dir.y -= 1;
  if (heldKeys.has('down')) dir.y += 1;
  state.keyboardDir = normalizeVector(dir);
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
    state.joystickDir = normalizeVector(limited);
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

function updateCombinedInput() {
  const combined = {
    x: state.keyboardDir.x + state.joystickDir.x,
    y: state.keyboardDir.y + state.joystickDir.y,
  };
  state.combinedDir = normalizeVector(combined);
}

function normalizeVector(vec) {
  const length = Math.hypot(vec.x, vec.y);
  if (!length) return { x: 0, y: 0 };
  return { x: vec.x / length, y: vec.y / length };
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
      return parts[idx + 1];
    }
    if (parts.length) {
      return parts[parts.length - 1];
    }
  } catch (err) {
    // Not a full URL, treat as ID
  }
  if (/^[a-f0-9]{8}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function connectSocket({ roomId, name, hostKey, passcode }) {
  if (!roomId || !name) {
    showStatus('Missing room or name', true);
    return;
  }

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
}

function handleServerMessage(message) {
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
      showStatus('Connected');
      handleStateTransition(message.state);
      
      // Save session and show leave button
      saveSession();
      elements.leaveGame.style.display = 'block';
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
      showScreen('game');
      renderHud();
      break;
    case 'player-joined':
      if (message.playerId !== state.playerId) {
        showStatus(`${message.playerName} joined the match`);
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
      renderResults(message);
      showScreen('results');
      break;
    case 'host-change':
      if (message.playerId === state.playerId) {
        state.isHost = true;
        showStatus('You are now the host');
      }
      break;
    case 'error':
      showStatus(message.message || 'Server error', true);
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
  if (serialized.config) {
    state.config = serialized.config;
  }
  if (serialized.players) {
    state.lastLobbyState = serialized;
  }
  if (serialized.state === 'running') {
    // Detect players that left (were in previous state but not in new state)
    if (state.gameState && state.gameState.players) {
      const newPlayerIds = new Set((serialized.players || []).map(p => p.id));
      const oldPlayers = state.gameState.players || [];
      
      oldPlayers.forEach(oldPlayer => {
        if (!newPlayerIds.has(oldPlayer.id)) {
          // Player left - start leave animation
          state.leavingPlayers.set(oldPlayer.id, {
            x: oldPlayer.x,
            y: oldPlayer.y,
            name: oldPlayer.name,
            startTime: Date.now(),
            animationDuration: 400 // 400ms animation
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
    
    state.gameState = serialized;
  }
  if (serialized.state === 'results') {
    state.resultsState = serialized;
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
    li.textContent = `${player.name}${player.id === state.playerId ? ' (You)' : ''}`;
    const score = document.createElement('span');
    score.textContent = `${player.score} pts`;
    li.appendChild(score);
    elements.scoreList.appendChild(li);
  });

  const maxScore = sorted.length ? sorted[0].score : 0;
  const target = state.config?.targetScore || 50;
  const pct = Math.min(1, maxScore / target);
  elements.progressFill.style.width = `${pct * 100}%`;
}

function renderResults(message) {
  const winnerId = message.winnerId || state.resultsState?.winnerId;
  const stateResults = message.state || state.resultsState;
  if (!stateResults) return;
  const winner = stateResults.players?.find((p) => p.id === winnerId);
  elements.winnerAnnouncement.textContent = winner ? `${winner.name} wins!` : 'Match complete';
  elements.resultsList.innerHTML = '';
  const scores = stateResults.scores || stateResults.players || [];
  scores
    .slice()
    .sort((a, b) => b.score - a.score)
    .forEach((entry, index) => {
      const li = document.createElement('li');
      li.textContent = `${index + 1}. ${entry.name}${entry.id === state.playerId ? ' (You)' : ''}`;
      const score = document.createElement('span');
      score.textContent = `${entry.score} pts`;
      li.appendChild(score);
      elements.resultsList.appendChild(li);
    });
  elements.rematch.disabled = !state.isHost;
}

function showStatus(message, isError = false, timeout = 4000) {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.classList.toggle('error', Boolean(isError));
  elements.status.classList.add('show');
  if (timeout) {
    clearTimeout(elements.status._hideTimer);
    elements.status._hideTimer = setTimeout(() => {
      elements.status.classList.remove('show');
    }, timeout);
  }
}

async function copyRoomLink() {
  if (!state.joinUrl) {
    showStatus('No join link yet', true);
    return;
  }
  try {
    // Remove query parameters from the URL before copying
    const url = new URL(state.joinUrl);
    const cleanUrl = `${url.origin}${url.pathname}`;
    await navigator.clipboard.writeText(cleanUrl);
    showStatus('Link copied');
  } catch (err) {
    console.warn('Copy failed', err);
    showStatus('Could not copy link', true);
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
  const payload = {
    type: 'input',
    seq: state.inputSeq,
    dir: state.combinedDir,
    action: state.pendingAction,
  };
  state.pendingAction = false;
  sendMessage(payload);
}, 50);

function draw(timestamp) {
  requestAnimationFrame(draw);
  if (!state.gameState) {
    clearCanvas();
    return;
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
  drawEnemies(game.enemies || []);
  drawPlayers(game.players || []);
  drawLeavingPlayers(timestamp);

  if (game.state === 'results') {
    ctx.fillStyle = 'rgba(10, 14, 19, 0.75)';
    ctx.fillRect(0, 0, width, height);
  }
}

function drawBackdrop(width, height, timestamp) {
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

function drawCoins(coins) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  coins.forEach((coin) => {
    const x = coin.x * scaleX;
    const y = coin.y * scaleY;
    
    // Outer glow circle
    ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();

    // Main coin body
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();

    // Coin border
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner highlight
    ctx.fillStyle = '#FCD34D';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawEnemies(enemies) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  enemies.forEach((enemy) => {
    const x = enemy.x * scaleX;
    const y = enemy.y * scaleY;
    
    if (enemy.active === false) {
      // Defeated enemy
      ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Active enemy with danger indicator
      if (!state.lowGraphics) {
        ctx.fillStyle = 'rgba(225, 29, 72, 0.15)';
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      // Main enemy body
      ctx.fillStyle = '#DC2626';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();

      // Enemy border
      ctx.strokeStyle = '#991B1B';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner core
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Bright center
      ctx.fillStyle = '#FCA5A5';
      ctx.beginPath();
      ctx.arc(x - 3, y - 3, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawPlayers(players) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  players.forEach((player) => {
    const x = player.x * scaleX;
    const y = player.y * scaleY;
    const isSelf = player.id === state.playerId;
    const radius = isSelf ? 18 : 16;

    if (!player.alive) {
      // Dead player
      ctx.fillStyle = 'rgba(31, 41, 55, 0.6)';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(75, 85, 99, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Dashing effect
      if (!state.lowGraphics && player.dashing) {
        ctx.fillStyle = isSelf ? 'rgba(22, 163, 74, 0.2)' : 'rgba(56, 189, 248, 0.2)';
        ctx.beginPath();
        ctx.arc(x, y, radius + 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Main player body
      ctx.fillStyle = isSelf ? '#16A34A' : '#0EA5E9';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Player border
      ctx.strokeStyle = isSelf ? '#15803D' : '#0369A1';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner highlight
      ctx.fillStyle = isSelf ? '#22C55E' : '#38BDF8';
      ctx.beginPath();
      ctx.arc(x, y, radius - 4, 0, Math.PI * 2);
      ctx.fill();

      // Bright spot
      ctx.fillStyle = isSelf ? '#86EFAC' : '#BAE6FD';
      ctx.beginPath();
      ctx.arc(x - 4, y - 4, 5, 0, Math.PI * 2);
      ctx.fill();

      // Self indicator
      if (isSelf) {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Player name with background
    ctx.fillStyle = 'rgba(10, 14, 19, 0.8)';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    const textWidth = ctx.measureText(player.name).width;
    ctx.fillRect(x - textWidth / 2 - 6, y - 34, textWidth + 12, 18);

    ctx.strokeStyle = isSelf ? '#F59E0B' : '#3F4D5E';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - textWidth / 2 - 6, y - 34, textWidth + 12, 18);

    ctx.fillStyle = isSelf ? '#FBBF24' : '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name, x, y - 25);
  });
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
  return displayWidth / 1600;
}

function canvasScaleY() {
  const displayHeight = parseFloat(elements.canvas.style.height) || elements.canvas.height;
  return displayHeight / 900;
}

window.addEventListener('resize', () => resizeCanvas(), { passive: true });
resizeCanvas();

function resizeCanvas() {
  const containerWidth = Math.min(window.innerWidth - 32, 960);
  const containerHeight = Math.min(window.innerHeight - 220, 540);
  const ratio = 1600 / 900;
  let width = containerWidth;
  let height = width / ratio;
  if (height > containerHeight) {
    height = containerHeight;
    width = height * ratio;
  }
  width = Math.max(640, Math.floor(width));
  height = Math.max(360, Math.floor(height));
  
  // Set display size (CSS pixels)
  elements.canvas.style.width = width + 'px';
  elements.canvas.style.height = height + 'px';
  
  // Set actual size in memory (scaled for high-DPI)
  const dpr = window.devicePixelRatio || 1;
  elements.canvas.width = width * dpr;
  elements.canvas.height = height * dpr;
  
  // Scale the context to maintain proper coordinate system
  ctx.scale(dpr, dpr);
  
  // Re-enable smooth rendering after resize
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

function updateFromDeepLink() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const idx = pathParts.findIndex((part) => part.toLowerCase() === 'play');
  if (idx >= 0 && pathParts[idx + 1]) {
    const roomId = pathParts[idx + 1];
    showScreen('join');
    elements.joinLink.value = buildJoinUrl(roomId, '');
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
    passcode: session.passcode
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

function renderLoopTicker() {
  if (state.gameState) {
    renderHud();
  }
  requestAnimationFrame(renderLoopTicker);
}

requestAnimationFrame(renderLoopTicker);
