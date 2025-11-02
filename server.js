import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const DEFAULT_CONFIG = {
  targetScore: 50,
  maxPlayers: 24,
  roomTimeoutMinutes: 10,
  passcodeEnabled: true,
  deathPenaltyEnabled: true,
};

const TICK_RATE = 30;
const FRAME_MS = 1000 / TICK_RATE;
const PLAYER_RADIUS = 24;
const COIN_RADIUS = 16;
const ENEMY_RADIUS = 28;
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;
const MAX_COINS = 12;
const MAX_ENEMIES = 6;
const RESPAWN_MS = 2000;
const DASH_DURATION_MS = 220;
const DASH_COOLDOWN_MS = 900;
const PLAYER_SPEED = 380;
const DASH_SPEED = 650;
const ENEMY_SPEED = 160;
const INPUT_RATE_LIMIT_MS = 16;
const LOBBY_HEARTBEAT_MS = 1000;
const ROOM_SWEEP_MS = 60000;
const RECONNECT_GRACE_MS = 10000; // 10 seconds to reconnect
const PROFANITY_LIST = ['ass', 'dick', 'shit', 'fuck', 'bitch'];

const rooms = new Map();
const disconnectedPlayers = new Map(); // playerId -> { player, roomId, disconnectTime }

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/create-room') {
      await handleCreateRoom(req, res);
      return;
    }

    await serveStatic(req, res);
  } catch (err) {
    console.error('HTTP error', err);
    res.statusCode = 500;
    res.end('Internal server error');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket, req) => {
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });
  socket.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      handleSocketMessage(socket, data);
    } catch (err) {
      console.warn('Invalid ws message', err);
    }
  });
  socket.on('close', () => {
    handleDisconnect(socket);
  });
});

setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
}, 30000);

setInterval(updateRooms, FRAME_MS);
setInterval(sweepRooms, ROOM_SWEEP_MS);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(PORT, () => {
  console.log(`Kimp Fun listening on http://localhost:${PORT}`);
});

async function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  
  // Serve index.html for root and /play/ routes
  if (pathname === '/' || pathname.startsWith('/play/')) {
    pathname = '/index.html';
  }
  
  // Serve all files from public directory
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.setHeader('Content-Type', getMimeType(filePath));
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.statusCode = 404;
      res.end('Not found');
    } else {
      throw err;
    }
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=UTF-8';
    case '.js':
      return 'application/javascript; charset=UTF-8';
    case '.css':
      return 'text/css; charset=UTF-8';
    case '.json':
      return 'application/json; charset=UTF-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function handleCreateRoom(req, res) {
  const body = await readBody(req);
  const {
    name,
    targetScore,
    maxPlayers,
    passcode,
    passcodeEnabled,
    deathPenaltyEnabled,
    roomTimeoutMinutes,
  } = body || {};

  const hostName = sanitizeName(name || 'Host');
  if (!hostName) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid name' }));
    return;
  }

  const config = { ...DEFAULT_CONFIG };
  if (Number.isInteger(targetScore) && targetScore >= 10 && targetScore <= 500) {
    config.targetScore = targetScore;
  }
  if (Number.isInteger(maxPlayers) && maxPlayers >= 2 && maxPlayers <= 48) {
    config.maxPlayers = maxPlayers;
  }
  if (typeof passcodeEnabled === 'boolean') {
    config.passcodeEnabled = passcodeEnabled;
  }
  if (typeof deathPenaltyEnabled === 'boolean') {
    config.deathPenaltyEnabled = deathPenaltyEnabled;
  }
  if (Number.isInteger(roomTimeoutMinutes) && roomTimeoutMinutes >= 2 && roomTimeoutMinutes <= 60) {
    config.roomTimeoutMinutes = roomTimeoutMinutes;
  }

  let roomPasscode = null;
  if (config.passcodeEnabled && typeof passcode === 'string' && passcode.trim().length > 0) {
    roomPasscode = passcode.trim().slice(0, 32);
  }

  const roomId = generateRoomId();
  const hostKey = crypto.randomBytes(16).toString('hex');
  const room = {
    id: roomId,
    hostKey,
    hostName,
    passcode: roomPasscode,
    config,
    createdAt: Date.now(),
    lastActive: Date.now(),
    state: 'lobby',
    matchId: 0,
    winnerId: null,
    players: new Map(),
    coins: new Map(),
    enemies: new Map(),
    reservedNames: new Set([hostName.toLowerCase()]),
    lastLobbyBroadcast: Date.now(),
  };
  rooms.set(roomId, room);

  const origin = req.headers.origin || `http://${req.headers.host}`;
  const baseUrl = new URL(origin);
  baseUrl.pathname = `/play/${roomId}`;
  const joinUrl = baseUrl.toString();

  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.end(
    JSON.stringify({
      roomId,
      hostKey,
      joinUrl,
      config,
    })
  );
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function generateRoomId() {
  let id = '';
  do {
    id = crypto.randomBytes(4).toString('hex');
  } while (rooms.has(id));
  return id;
}

function sanitizeName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 16);
  if (trimmed.length < 2) return null;
  if (hasProfanity(trimmed)) return null;
  return trimmed;
}

function hasProfanity(name) {
  const lowered = name.toLowerCase();
  return PROFANITY_LIST.some((word) => lowered.includes(word));
}

function handleSocketMessage(socket, data) {
  if (!data || typeof data.type !== 'string') {
    return;
  }

  switch (data.type) {
    case 'join':
      handleJoin(socket, data);
      break;
    case 'input':
      handleInput(socket, data);
      break;
    case 'start':
      handleStart(socket, data);
      break;
    case 'rematch':
      handleRematch(socket, data);
      break;
    case 'ping':
      socket.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      break;
  }
}

function handleJoin(socket, payload) {
  const { roomId, name, passcode, hostKey } = payload || {};
  const room = rooms.get(roomId);
  if (!room) {
    send(socket, { type: 'error', message: 'Room not found' });
    socket.close();
    return;
  }

  const requestedName = sanitizeName(name);
  if (!requestedName) {
    send(socket, { type: 'error', message: 'Invalid name' });
    return;
  }

  if (room.passcode && room.passcode !== passcode) {
    send(socket, { type: 'error', message: 'Invalid passcode' });
    return;
  }

  // Check if this is a reconnecting player
  const loweredName = requestedName.toLowerCase();
  const existingPlayer = Array.from(room.players.values()).find(
    p => p.name.toLowerCase() === loweredName && p.disconnected
  );
  
  if (existingPlayer) {
    // Reconnect existing player
    existingPlayer.connection = socket;
    existingPlayer.disconnected = false;
    socket.playerId = existingPlayer.id;
    socket.roomId = room.id;
    
    // Remove from disconnected list
    disconnectedPlayers.delete(existingPlayer.id);
    
    send(socket, {
      type: 'joined',
      roomId: room.id,
      playerId: existingPlayer.id,
      isHost: existingPlayer.isHost,
      state: serializeRoom(room),
    });
    
    if (room.state === 'running') {
      send(socket, {
        type: 'match-start',
        state: serializeGame(room),
      });
    } else {
      broadcast(room, {
        type: 'lobby-update',
        state: serializeLobby(room),
      });
    }
    
    room.lastActive = Date.now();
    return;
  }

  if (room.players.size >= room.config.maxPlayers) {
    send(socket, { type: 'error', message: 'Room full' });
    return;
  }

  let finalName = requestedName;
  let isHost = false;

  if (hostKey && hostKey === room.hostKey && !Array.from(room.players.values()).some((p) => p.isHost)) {
    isHost = true;
    finalName = room.hostName;
  }

  const lowered = finalName.toLowerCase();
  const nameInUse = Array.from(room.players.values()).some((p) => p.name.toLowerCase() === lowered);
  if (!isHost && (room.reservedNames.has(lowered) || nameInUse)) {
    send(socket, { type: 'error', message: 'Name in use' });
    return;
  }
  if (isHost && room.reservedNames.has(lowered)) {
    room.reservedNames.delete(lowered);
  }

  const playerId = crypto.randomBytes(8).toString('hex');
  const player = {
    id: playerId,
  name: finalName,
  isHost,
    connection: socket,
    roomId: room.id,
    lastInputAt: 0,
    inputSeq: 0,
    inputDir: { x: 0, y: 0 },
    wantsAction: false,
    x: Math.random() * (MAP_WIDTH - 200) + 100,
    y: Math.random() * (MAP_HEIGHT - 200) + 100,
    angle: 0,
    score: 0,
    alive: true,
    respawnAt: 0,
    dashingUntil: 0,
    dashCooldownUntil: 0,
    joinedAt: Date.now(),
  };

  socket.playerId = playerId;
  socket.roomId = room.id;
  room.players.set(playerId, player);
  room.lastActive = Date.now();

  // If joining during active match, spawn player in the game
  if (room.state === 'running') {
    player.x = Math.random() * (MAP_WIDTH - 400) + 200;
    player.y = Math.random() * (MAP_HEIGHT - 400) + 200;
    
    send(socket, {
      type: 'joined',
      roomId: room.id,
      playerId,
      isHost: player.isHost,
      state: serializeRoom(room),
    });

    // Notify existing players
    broadcast(room, {
      type: 'player-joined',
      playerId: playerId,
      playerName: player.name,
    });

    // Send game state to new player
    send(socket, {
      type: 'match-start',
      state: serializeGame(room),
    });
  } else {
    send(socket, {
      type: 'joined',
      roomId: room.id,
      playerId,
      isHost: player.isHost,
      state: serializeRoom(room),
    });

    broadcast(room, {
      type: 'lobby-update',
      state: serializeLobby(room),
    });
  }
}

function handleInput(socket, payload) {
  const player = resolvePlayer(socket);
  if (!player) return;
  const room = rooms.get(player.roomId);
  if (!room || room.state !== 'running') return;

  const now = Date.now();
  if (now - player.lastInputAt < INPUT_RATE_LIMIT_MS) return;
  player.lastInputAt = now;

  const { seq, dir, action } = payload;
  if (typeof seq === 'number') {
    player.inputSeq = seq;
  }
  if (dir && typeof dir.x === 'number' && typeof dir.y === 'number') {
    const magnitude = Math.hypot(dir.x, dir.y);
    if (magnitude > 0) {
      player.inputDir = { x: dir.x / Math.min(1, magnitude), y: dir.y / Math.min(1, magnitude) };
    } else {
      player.inputDir = { x: 0, y: 0 };
    }
  }
  player.wantsAction = Boolean(action);
  room.lastActive = now;
}

function handleStart(socket, payload) {
  const player = resolvePlayer(socket);
  if (!player) return;
  const room = rooms.get(player.roomId);
  if (!room) return;
  if (!player.isHost) return;
  if (room.state !== 'lobby') return;
  if (room.players.size < 1) {
    send(player.connection, { type: 'error', message: 'No players in room' });
    return;
  }

  startMatch(room);
}

function handleRematch(socket, payload) {
  const player = resolvePlayer(socket);
  if (!player) return;
  const room = rooms.get(player.roomId);
  if (!room) return;
  if (!player.isHost) return;
  if (room.state !== 'results') return;
  if (room.players.size < 1) {
    send(player.connection, { type: 'error', message: 'No players in room' });
    return;
  }

  startMatch(room, true);
}

function startMatch(room, isRematch = false) {
  room.state = 'running';
  room.matchId += 1;
  room.winnerId = null;
  room.coins.clear();
  room.enemies.clear();
  room.lastActive = Date.now();

  const seeds = crypto.randomBytes(8).readUInt32BE(0);
  room.randomSeed = seeds;

  for (const player of room.players.values()) {
    player.score = 0;
    player.inputDir = { x: 0, y: 0 };
    player.wantsAction = false;
    player.alive = true;
    player.respawnAt = 0;
    player.dashingUntil = 0;
    player.dashCooldownUntil = 0;
    player.x = Math.random() * (MAP_WIDTH - 400) + 200;
    player.y = Math.random() * (MAP_HEIGHT - 400) + 200;
  }

  ensureCoins(room);
  ensureEnemies(room);

  broadcast(room, {
    type: 'match-start',
    state: serializeGame(room),
  });
}

function ensureCoins(room) {
  while (room.coins.size < MAX_COINS) {
    const id = crypto.randomBytes(6).toString('hex');
    room.coins.set(id, {
      id,
      x: Math.random() * (MAP_WIDTH - 120) + 60,
      y: Math.random() * (MAP_HEIGHT - 120) + 60,
    });
  }
}

function ensureEnemies(room) {
  while (room.enemies.size < MAX_ENEMIES) {
    const id = crypto.randomBytes(6).toString('hex');
    room.enemies.set(id, {
      id,
      x: Math.random() * (MAP_WIDTH - 120) + 60,
      y: Math.random() * (MAP_HEIGHT - 120) + 60,
      vx: randomRange(-ENEMY_SPEED, ENEMY_SPEED),
      vy: randomRange(-ENEMY_SPEED, ENEMY_SPEED),
      respawnAt: 0,
    });
  }
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function updateRooms() {
  const now = Date.now();
  rooms.forEach((room) => {
    if (room.state === 'running') {
      updateMatch(room, now);
    } else if (room.state === 'lobby' && now - room.lastLobbyBroadcast > LOBBY_HEARTBEAT_MS) {
      room.lastLobbyBroadcast = now;
      broadcast(room, {
        type: 'lobby-update',
        state: serializeLobby(room),
      });
    }
  });
}

function updateMatch(room, now) {
  const delta = FRAME_MS / 1000;

  for (const player of room.players.values()) {
    if (player.disconnected || !player.connection || player.connection.readyState !== player.connection.OPEN) continue;
    if (!player.alive) {
      if (now >= player.respawnAt) {
        player.alive = true;
        player.x = Math.random() * (MAP_WIDTH - 400) + 200;
        player.y = Math.random() * (MAP_HEIGHT - 400) + 200;
      } else {
        continue;
      }
    }

    let speed = PLAYER_SPEED;
    if (player.dashingUntil > now) {
      speed = DASH_SPEED;
    }
    const dx = player.inputDir.x * speed * delta;
    const dy = player.inputDir.y * speed * delta;
    player.x = clamp(player.x + dx, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
    player.y = clamp(player.y + dy, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);

    const wantsAction = player.wantsAction;
    player.wantsAction = false;
    if (wantsAction && now > player.dashCooldownUntil) {
      player.dashingUntil = now + DASH_DURATION_MS;
      player.dashCooldownUntil = now + DASH_COOLDOWN_MS;
    }
  }

  handleCoinCollisions(room, now);
  if (room.state !== 'running') return;
  handleEnemyLogic(room, now, delta);
  if (room.state !== 'running') return;
  broadcast(room, {
    type: 'state',
    state: serializeGame(room),
  });
}

function handleCoinCollisions(room, now) {
  const toDelete = [];
  for (const player of room.players.values()) {
    if (player.disconnected || !player.alive) continue;
    for (const coin of room.coins.values()) {
      const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
      if (dist <= PLAYER_RADIUS + COIN_RADIUS) {
        toDelete.push(coin.id);
        player.score += 1;
        if (checkWin(room, player)) {
          room.coins.delete(coin.id);
          return;
        }
      }
    }
  }
  for (const id of toDelete) {
    room.coins.delete(id);
  }
  if (toDelete.length) {
    ensureCoins(room);
  }
}

function handleEnemyLogic(room, now, delta) {
  for (const enemy of room.enemies.values()) {
    if (enemy.respawnAt && now < enemy.respawnAt) {
      continue;
    }
    if (enemy.respawnAt && now >= enemy.respawnAt) {
      enemy.respawnAt = 0;
      enemy.x = Math.random() * (MAP_WIDTH - 120) + 60;
      enemy.y = Math.random() * (MAP_HEIGHT - 120) + 60;
      enemy.vx = randomRange(-ENEMY_SPEED, ENEMY_SPEED);
      enemy.vy = randomRange(-ENEMY_SPEED, ENEMY_SPEED);
    }

    enemy.x += enemy.vx * delta;
    enemy.y += enemy.vy * delta;
    if (enemy.x < ENEMY_RADIUS || enemy.x > MAP_WIDTH - ENEMY_RADIUS) {
      enemy.vx *= -1;
      enemy.x = clamp(enemy.x, ENEMY_RADIUS, MAP_WIDTH - ENEMY_RADIUS);
    }
    if (enemy.y < ENEMY_RADIUS || enemy.y > MAP_HEIGHT - ENEMY_RADIUS) {
      enemy.vy *= -1;
      enemy.y = clamp(enemy.y, ENEMY_RADIUS, MAP_HEIGHT - ENEMY_RADIUS);
    }

    for (const player of room.players.values()) {
      if (player.disconnected || !player.alive) continue;
      const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (dist <= PLAYER_RADIUS + ENEMY_RADIUS) {
        if (player.dashingUntil > now) {
          player.score += 2;
          if (checkWin(room, player)) {
            enemy.respawnAt = now + 1500;
            return;
          }
          enemy.respawnAt = now + 1500;
        } else if (room.config.deathPenaltyEnabled) {
          player.score = Math.max(0, player.score - 1);
          player.alive = false;
          player.respawnAt = now + RESPAWN_MS;
        } else {
          player.alive = false;
          player.respawnAt = now + RESPAWN_MS;
        }
      }
    }
  }
}

function checkWin(room, player) {
  if (room.state !== 'running') return false;
  if (player.score >= room.config.targetScore) {
    room.state = 'results';
    room.winnerId = player.id;
    room.lastActive = Date.now();
    broadcast(room, {
      type: 'match-end',
      winnerId: player.id,
      state: serializeResults(room),
    });
    return true;
  }
  return false;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function broadcast(room, message) {
  const payload = JSON.stringify(message);
  if (message.type === 'lobby-update') {
    room.lastLobbyBroadcast = Date.now();
  }
  for (const player of room.players.values()) {
    const ws = player.connection;
    if (!ws || ws.readyState !== ws.OPEN) continue;
    try {
      ws.send(payload);
    } catch (err) {
      console.warn('Broadcast error', err);
    }
  }
}

function send(socket, message) {
  if (!socket || socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function serializeLobby(room) {
  return {
    id: room.id,
    state: room.state,
    config: room.config,
    players: Array.from(room.players.values())
      .filter(p => !p.disconnected) // Don't show disconnected players in lobby
      .map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        score: p.score,
      })),
  };
}

function serializeGame(room) {
  return {
    id: room.id,
    state: room.state,
    config: room.config,
    targetScore: room.config.targetScore,
    matchId: room.matchId,
    players: Array.from(room.players.values())
      .filter(p => !p.disconnected) // Don't send disconnected players in game state
      .map((p) => ({
        id: p.id,
        name: p.name,
        x: Math.round(p.x),
        y: Math.round(p.y),
        score: p.score,
        alive: p.alive,
        isHost: p.isHost,
        dashing: p.dashingUntil > Date.now(),
      })),
    coins: Array.from(room.coins.values()).map((c) => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y) })),
    enemies: Array.from(room.enemies.values()).map((e) => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), active: !e.respawnAt })),
  };
}

function serializeResults(room) {
  const result = serializeGame(room);
  result.state = 'results';
  result.winnerId = room.winnerId;
  result.scores = Array.from(room.players.values())
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isHost: p.isHost,
    }))
    .sort((a, b) => b.score - a.score);
  return result;
}

function serializeRoom(room) {
  if (room.state === 'lobby') return serializeLobby(room);
  if (room.state === 'running') return serializeGame(room);
  return serializeResults(room);
}

function handleDisconnect(socket) {
  const player = resolvePlayer(socket);
  if (!player) return;
  const room = rooms.get(player.roomId);
  if (!room) return;
  
  // Store disconnected player for potential reconnection
  disconnectedPlayers.set(player.id, {
    player: { ...player },
    roomId: room.id,
    disconnectTime: Date.now()
  });
  
  // Mark player as disconnected but keep in room
  player.connection = null;
  player.disconnected = true;
  
  // Set a timeout to actually remove the player if they don't reconnect
  setTimeout(() => {
    const disconnectInfo = disconnectedPlayers.get(player.id);
    if (disconnectInfo && Date.now() - disconnectInfo.disconnectTime >= RECONNECT_GRACE_MS) {
      disconnectedPlayers.delete(player.id);
      const currentRoom = rooms.get(disconnectInfo.roomId);
      if (currentRoom) {
        const currentPlayer = currentRoom.players.get(player.id);
        if (currentPlayer && currentPlayer.disconnected) {
          currentRoom.players.delete(player.id);
          if (player.isHost) {
            promoteNewHost(currentRoom);
          }
          currentRoom.lastActive = Date.now();
          
          // Only send lobby-update if in lobby, otherwise game continues
          if (currentRoom.state === 'lobby') {
            broadcast(currentRoom, {
              type: 'lobby-update',
              state: serializeLobby(currentRoom),
            });
          }
          
          if (currentRoom.players.size === 0) {
            rooms.delete(currentRoom.id);
          }
        }
      }
    }
  }, RECONNECT_GRACE_MS);
  
  room.lastActive = Date.now();
}

function promoteNewHost(room) {
  for (const candidate of room.players.values()) {
    if (candidate.disconnected) continue; // Skip disconnected players
    candidate.isHost = true;
    broadcast(room, { type: 'host-change', playerId: candidate.id });
    break;
  }
}

function resolvePlayer(socket) {
  if (!socket || !socket.roomId || !socket.playerId) return null;
  const room = rooms.get(socket.roomId);
  if (!room) return null;
  return room.players.get(socket.playerId) || null;
}

function sweepRooms() {
  const now = Date.now();
  rooms.forEach((room, id) => {
    if (room.players.size === 0) {
      if (now - room.lastActive > room.config.roomTimeoutMinutes * 60000) {
        rooms.delete(id);
      }
    }
  });
}
