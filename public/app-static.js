// Static hosting fallback - uses WebRTC for P2P or prompts for server URL
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
  serverUrlInput: document.getElementById('server-url'),
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
};

const ctx = elements.canvas.getContext('2d');

// Get WebSocket server URL from localStorage or prompt user
let wsServerUrl = localStorage.getItem('kimpfun-server-url') || '';

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
};

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
  if (!wsServerUrl) {
    promptForServerUrl();
    return;
  }
  showScreen('create');
  elements.createName.focus();
});

elements.splashJoin.addEventListener('click', () => {
  if (!wsServerUrl) {
    promptForServerUrl();
    return;
  }
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

function promptForServerUrl() {
  const url = prompt(
    'Enter your Kimp Fun server URL (WebSocket):\n\nExamples:\n• ws://localhost:3000\n• wss://your-server.com\n• wss://your-server.onrender.com',
    'wss://'
  );
  if (url && (url.startsWith('ws://') || url.startsWith('wss://'))) {
    wsServerUrl = url.trim();
    localStorage.setItem('kimpfun-server-url', wsServerUrl);
    showStatus('Server URL saved');
  } else if (url !== null) {
    showStatus('Invalid WebSocket URL. Must start with ws:// or wss://', true);
  }
}

elements.createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  
  if (!wsServerUrl) {
    promptForServerUrl();
    if (!wsServerUrl) return;
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
    const httpUrl = wsServerUrl.replace(/^wss?:/, location.protocol.replace(':', ''));
    const response = await fetch(`${httpUrl}/api/create-room`, {
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
    showStatus(err.message || 'Could not create room. Check server URL.', true);
  }
});

elements.joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  
  if (!wsServerUrl) {
    promptForServerUrl();
    if (!wsServerUrl) return;
  }

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
  url.search = '';
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

  if (!wsServerUrl) {
    showStatus('Server URL not configured', true);
    promptForServerUrl();
    return;
  }

  if (state.ws) {
    state.ws.close(1000, 'Reconnecting');
    state.ws = null;
  }

  const socket = new WebSocket(wsServerUrl);
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
      showStatus('Connection closed', true);
    }
  });

  socket.addEventListener('error', () => {
    if (state.ws === socket) {
      showStatus('Network error. Check server URL.', true);
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
      break;
    case 'lobby-update':
      updateFromSerializedState(message.state);
      if (state.screen !== 'lobby') {
        showScreen('lobby');
      }
      renderLobby();
      break;
    case 'match-start':
      updateFromSerializedState(message.state);
      state.resultsState = null;
      showScreen('game');
      renderHud();
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
  const previousPlayersArray = state.gameState?.players || [];
  const previousPlayers = new Map(previousPlayersArray.map((player) => [player.id, player]));
  const previousEnemiesArray = state.gameState?.enemies || [];
  const previousEnemies = new Map(previousEnemiesArray.map((enemy) => [enemy.id, enemy]));
  if (serialized.config) {
    state.config = serialized.config;
  }
  if (serialized.players) {
    state.lastLobbyState = serialized;
  }
  if (serialized.state === 'running') {
    const players = serialized.players || [];
    players.forEach((player) => {
      const previous = previousPlayers.get(player.id);
      if (!player.alive) {
        player.dirX = 0;
        player.dirY = 0;
        return;
      }
      const dx = previous ? player.x - previous.x : 0;
      const dy = previous ? player.y - previous.y : 0;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 0.01) {
        player.dirX = dx / magnitude;
        player.dirY = dy / magnitude;
      } else {
        player.dirX = 0;
        player.dirY = 0;
      }
    });

    const enemies = serialized.enemies || [];
    enemies.forEach((enemy) => {
      const previous = previousEnemies.get(enemy.id);
      if (enemy.active === false) {
        enemy.dirX = 0;
        enemy.dirY = 0;
        return;
      }
      const dx = previous ? enemy.x - previous.x : 0;
      const dy = previous ? enemy.y - previous.y : 0;
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
    });

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
  elements.startButton.disabled = !state.isHost || (players?.length || 0) < 2;
  elements.rematch.disabled = !state.isHost;
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
    await navigator.clipboard.writeText(state.joinUrl);
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
  ctx.fillStyle = '#0B0F12';
  ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
}

function renderGameScene(game, timestamp) {
  const width = elements.canvas.width;
  const height = elements.canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!state.lowGraphics) {
    drawBackdrop(width, height, timestamp);
  } else {
    ctx.fillStyle = '#0B0F12';
    ctx.fillRect(0, 0, width, height);
  }

  drawCoins(game.coins || []);
  drawEnemies(game.enemies || []);
  drawPlayers(game.players || []);

  if (game.state === 'results') {
    ctx.fillStyle = 'rgba(11, 15, 18, 0.6)';
    ctx.fillRect(0, 0, width, height);
  }
}

function drawBackdrop(width, height, timestamp) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width);
  gradient.addColorStop(0, '#112022');
  gradient.addColorStop(1, '#061015');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 48;
  const offset = (timestamp / 40) % gridSize;
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
}

function drawCoins(coins) {
  const scaleX = canvasScaleX();
  const scaleY = canvasScaleY();
  coins.forEach((coin) => {
    const x = coin.x * scaleX;
    const y = coin.y * scaleY;
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFE08A';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
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
    const radius = enemy.active === false ? 6 : 16;
    ctx.beginPath();
    ctx.fillStyle = enemy.active === false ? 'rgba(255,255,255,0.2)' : '#E11D48';
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (!state.lowGraphics && enemy.active !== false) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (enemy.active !== false) {
      drawDirectionNotch(x, y, radius, enemy.dirX ?? 0, enemy.dirY ?? 0, {
        fill: '#F87171',
        stroke: '#7F1D1D',
        tipOffset: 8,
        halfWidth: 4,
        lineWidth: 1.4,
      });
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
    ctx.beginPath();
    ctx.fillStyle = isSelf ? '#16A34A' : '#38BDF8';
    ctx.arc(x, y, isSelf ? 18 : 16, 0, Math.PI * 2);
    ctx.fill();
    if (!player.alive) {
      ctx.fillStyle = 'rgba(8, 10, 12, 0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!state.lowGraphics && player.dashing) {
      ctx.strokeStyle = '#EAB308';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    drawDirectionNotch(x, y, isSelf ? 18 : 16, player.dirX ?? 0, player.dirY ?? 0, {
      fill: isSelf ? '#FDE68A' : '#E0F2FE',
      stroke: isSelf ? '#D97706' : '#0284C7',
      tipOffset: 10,
      halfWidth: 4,
      lineWidth: 1.2,
    });
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(player.name, x, y - 24);
  });
}

function canvasScaleX() {
  return elements.canvas.width / 1600;
}

function canvasScaleY() {
  return elements.canvas.height / 900;
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
  elements.canvas.width = width;
  elements.canvas.height = height;
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

updateFromDeepLink();

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

// Show server URL prompt on first load if not set
if (!wsServerUrl) {
  showStatus('Click "Create Game" or "Join Game" to configure server', false, 8000);
}
