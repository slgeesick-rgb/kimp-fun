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
  maxPlayers: 15,
  roomTimeoutMinutes: 10,
  passcodeEnabled: true,
  deathPenaltyEnabled: true,
};

const TICK_RATE = 30;
const FRAME_MS = 1000 / TICK_RATE;
const PLAYER_RADIUS = 18;
const COIN_RADIUS = 12;
const ENEMY_RADIUS = 22;
const POWERUP_RADIUS = 16;
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;
const MAX_COINS = 12;
const MAX_ENEMIES = 6;
const MAX_POWERUPS_PER_GAME = 2; // Only 2 powerups per game session
const RESPAWN_MS = 2000;
const DASH_DURATION_MS = 220;
const DASH_COOLDOWN_MS = 900;
const PLAYER_SPEED = 380;
const DASH_SPEED = 650;
const ENEMY_SPEED = 160;
const POWERUP_SPAWN_INTERVAL = 20000; // 20 seconds - make them rare
const POWERUP_DURATION_MS = 5000; // 5 seconds - powerup expires after collection
const POWERUP_KILL_RADIUS = 200; // Radius to kill nearby players
const RAPIDFIRE_RADIUS = 16;
const RAPIDFIRE_SPAWN_INTERVAL = 15000; // 15 seconds - spawn more frequently than powerups
const RAPIDFIRE_DURATION_MS = 3000; // 3 seconds of rapid-fire
const RAPIDFIRE_INTERVAL_MS = 150; // Fire every 150ms (6.67 shots per second)
const BULLET_RADIUS = 4;
const BULLET_SPEED = 500; // Pixels per second
const BULLET_LIFETIME_MS = 2000; // Bullets last 2 seconds
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

    if (req.method === 'GET' && req.url.startsWith('/api/room/')) {
      await handleRoomInfo(req, res);
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

async function handleRoomInfo(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const roomIdRaw = parts[parts.length - 1] || '';
  const roomId = roomIdRaw.toLowerCase();

  if (!roomId || !/^[a-f0-9]{8}$/.test(roomId)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.end(JSON.stringify({ error: 'Invalid room id' }));
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.end(JSON.stringify({ error: 'Room not found' }));
    return;
  }

  const players = Array.from(room.players.values())
    .filter((player) => !player.disconnected)
    .map((player) => ({
      id: player.id,
      name: player.name,
      spaceship: player.spaceship || null,
    }));

  const takenSpaceships = players
    .map((player) => player.spaceship)
    .filter((ship) => Number.isInteger(ship));

  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.end(JSON.stringify({
    roomId: room.id,
    state: room.state,
    config: {
      maxPlayers: room.config.maxPlayers,
      targetScore: room.config.targetScore,
      deathPenaltyEnabled: room.config.deathPenaltyEnabled,
    },
    passcodeRequired: Boolean(room.passcode),
    players,
    takenSpaceships,
  }));
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
  if (Number.isInteger(maxPlayers) && maxPlayers >= 2 && maxPlayers <= 15) {
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
    lastPowerupSpawn: 0,
    powerupsSpawnedThisGame: 0,
    lastRapidfireSpawn: 0,
    config,
    createdAt: Date.now(),
    gameStartedAt: null, // Track when the game actually starts
    lastActive: Date.now(),
    state: 'lobby',
    matchId: 0,
    winnerId: null,
    players: new Map(),
    coins: new Map(),
    enemies: new Map(),
    powerups: new Map(),
    rapidfires: new Map(),
    bullets: new Map(),
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
    case 'timeout':
      handleTimeout(socket, data);
      break;
    case 'ping':
      socket.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      break;
  }
}

function handleJoin(socket, payload) {
  const { roomId, name, passcode, hostKey, spaceship } = payload || {};
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

  // Validate spaceship selection
  if (!spaceship || spaceship < 1 || spaceship > 15) {
    send(socket, { type: 'error', message: 'Invalid spaceship selection' });
    return;
  }

  // Check if this is a reconnecting player
  const loweredName = requestedName.toLowerCase();
  const existingPlayer = Array.from(room.players.values()).find(
    p => p.name.toLowerCase() === loweredName && p.disconnected
  );
  
  if (existingPlayer) {
    // Reconnect existing player - they keep their original spaceship
    // No need to validate spaceship for reconnecting players
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

  // Check if spaceship is already taken by another active player
  const spaceshipTaken = Array.from(room.players.values()).some(
    p => p.spaceship === spaceship && !p.disconnected
  );
  
  if (spaceshipTaken) {
    send(socket, { type: 'error', message: 'Spaceship already taken' });
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
    wantsPowerup: false,
    hasPowerup: false,
    powerupExpiresAt: 0,
    hasRapidfire: false,
    rapidfireExpiresAt: 0,
    lastRapidfireShot: 0,
    x: Math.random() * (MAP_WIDTH - 200) + 100,
    y: Math.random() * (MAP_HEIGHT - 200) + 100,
    angle: 0,
  aim: 0,
    score: 0,
    alive: true,
    respawnAt: 0,
    dashingUntil: 0,
    dashCooldownUntil: 0,
    joinedAt: Date.now(),
    spaceship: spaceship,
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

  const { seq, dir, action, powerup, aim } = payload;
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
  player.wantsPowerup = Boolean(powerup);
  if (typeof aim === 'number' && Number.isFinite(aim)) {
    player.aim = normalizeAngle(aim);
  }
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

function handleTimeout(socket, payload) {
  const player = resolvePlayer(socket);
  if (!player) return;
  const room = rooms.get(player.roomId);
  if (!room) return;
  if (!player.isHost) return;
  if (room.state !== 'running') return;

  // End the game due to timeout
  room.state = 'results';
  room.winnerId = null; // No winner for timeout
  room.lastActive = Date.now();
  
  broadcast(room, {
    type: 'match-end',
    winnerId: null,
    timedOut: true,
    state: serializeResults(room),
  });
}

function startMatch(room, isRematch = false) {
  room.state = 'running';
  room.matchId += 1;
  room.winnerId = null;
  room.coins.clear();
  room.enemies.clear();
  room.powerups.clear();
  room.rapidfires.clear();
  room.bullets.clear();
  room.lastPowerupSpawn = Date.now();
  room.powerupsSpawnedThisGame = 0; // Reset powerup counter for new game
  room.lastRapidfireSpawn = Date.now();
  room.lastActive = Date.now();
  
  // Set game start time for countdown timer (only on first match start)
  if (!room.gameStartedAt) {
    room.gameStartedAt = Date.now();
  }

  const seeds = crypto.randomBytes(8).readUInt32BE(0);
  room.randomSeed = seeds;

  for (const player of room.players.values()) {
    player.score = 0;
    player.inputDir = { x: 0, y: 0 };
    player.wantsAction = false;
    player.wantsPowerup = false;
    player.hasPowerup = false;
    player.powerupExpiresAt = 0;
    player.hasRapidfire = false;
    player.rapidfireExpiresAt = 0;
    player.lastRapidfireShot = 0;
    player.alive = true;
    player.respawnAt = 0;
    player.dashingUntil = 0;
    player.dashCooldownUntil = 0;
    player.x = Math.random() * (MAP_WIDTH - 400) + 200;
    player.y = Math.random() * (MAP_HEIGHT - 400) + 200;
    player.aim = 0;
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

function ensurePowerups(room, now) {
  // Remove expired powerups from the map
  const toDelete = [];
  for (const powerup of room.powerups.values()) {
    if (now >= powerup.expiresAt) {
      toDelete.push(powerup.id);
    }
  }
  for (const id of toDelete) {
    room.powerups.delete(id);
  }
  
  // Check if we've already spawned the maximum powerups for this game session
  if (room.powerupsSpawnedThisGame >= MAX_POWERUPS_PER_GAME) {
    return;
  }
  
  // Only spawn a new powerup if enough time has passed
  if (now - room.lastPowerupSpawn < POWERUP_SPAWN_INTERVAL) {
    return;
  }
  
  // Don't spawn if there's already one on the map (only one at a time)
  if (room.powerups.size > 0) {
    return;
  }
  
  const id = crypto.randomBytes(6).toString('hex');
  room.powerups.set(id, {
    id,
    x: Math.random() * (MAP_WIDTH - 200) + 100,
    y: Math.random() * (MAP_HEIGHT - 200) + 100,
    expiresAt: now + POWERUP_DURATION_MS, // Powerup disappears after 5 seconds
  });
  room.lastPowerupSpawn = now;
  room.powerupsSpawnedThisGame += 1; // Increment the counter
}

function ensureRapidfires(room, now) {
  // Remove expired rapidfire collectibles from the map
  const toDelete = [];
  for (const rapidfire of room.rapidfires.values()) {
    if (now >= rapidfire.expiresAt) {
      toDelete.push(rapidfire.id);
    }
  }
  for (const id of toDelete) {
    room.rapidfires.delete(id);
  }
  
  // Only spawn a new rapidfire if enough time has passed
  if (now - room.lastRapidfireSpawn < RAPIDFIRE_SPAWN_INTERVAL) {
    return;
  }
  
  // Don't spawn if there's already one on the map (only one at a time)
  if (room.rapidfires.size > 0) {
    return;
  }
  
  const id = crypto.randomBytes(6).toString('hex');
  room.rapidfires.set(id, {
    id,
    x: Math.random() * (MAP_WIDTH - 200) + 100,
    y: Math.random() * (MAP_HEIGHT - 200) + 100,
    expiresAt: now + 10000, // Rapidfire collectible disappears after 10 seconds
  });
  room.lastRapidfireSpawn = now;
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  const wrapped = angle % twoPi;
  return wrapped < 0 ? wrapped + twoPi : wrapped;
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
  handlePowerupCollisions(room, now);
  if (room.state !== 'running') return;
  handlePowerupExpiration(room, now);
  handlePowerupUsage(room, now);
  if (room.state !== 'running') return;
  handleRapidfireCollisions(room, now);
  if (room.state !== 'running') return;
  handleRapidfireExpiration(room, now);
  handleRapidfireAutoShoot(room, now);
  if (room.state !== 'running') return;
  updateBullets(room, now, delta);
  handleBulletCollisions(room, now);
  if (room.state !== 'running') return;
  handleEnemyLogic(room, now, delta);
  if (room.state !== 'running') return;
  ensurePowerups(room, now);
  ensureRapidfires(room, now);
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

function handlePowerupCollisions(room, now) {
  const toDelete = [];
  for (const player of room.players.values()) {
    if (player.disconnected || !player.alive || player.hasPowerup) continue;
    
    // Check if player wants to collect powerup (pressed spacebar)
    const wantsPowerup = player.wantsPowerup;
    
    if (wantsPowerup) {
      for (const powerup of room.powerups.values()) {
        const dist = Math.hypot(player.x - powerup.x, player.y - powerup.y);
        if (dist <= PLAYER_RADIUS + POWERUP_RADIUS) {
          toDelete.push(powerup.id);
          player.hasPowerup = true;
          player.powerupExpiresAt = now + POWERUP_DURATION_MS; // Set expiration time
          player.wantsPowerup = false; // Consume the input for collection
          break; // Only one powerup per player at a time
        }
      }
    }
  }
  for (const id of toDelete) {
    room.powerups.delete(id);
  }
}

function handlePowerupExpiration(room, now) {
  // Check if any player's powerup has expired
  for (const player of room.players.values()) {
    if (player.hasPowerup && now >= player.powerupExpiresAt) {
      player.hasPowerup = false;
      player.powerupExpiresAt = 0;
    }
  }
}

function handlePowerupUsage(room, now) {
  for (const player of room.players.values()) {
    if (player.disconnected || !player.alive) continue;
    
    const wantsPowerup = player.wantsPowerup;
    player.wantsPowerup = false;
    
    // Only use powerup if player has one AND the input wasn't already consumed by collection
    if (wantsPowerup && player.hasPowerup) {
      // Use powerup - kill nearby players
      player.hasPowerup = false;
      player.powerupExpiresAt = 0;
      
      for (const target of room.players.values()) {
        if (target.id === player.id || target.disconnected || !target.alive) continue;
        
        const dist = Math.hypot(player.x - target.x, player.y - target.y);
        if (dist <= POWERUP_KILL_RADIUS) {
          // Kill the target player
          if (room.config.deathPenaltyEnabled) {
            target.score = Math.max(0, target.score - 1);
          }
          target.alive = false;
          target.respawnAt = now + RESPAWN_MS;
          
          // Give points to the player who used the powerup
          player.score += 10;
          if (checkWin(room, player)) {
            return;
          }
        }
      }
    }
  }
}

function handleRapidfireCollisions(room, now) {
  const toDelete = [];
  for (const player of room.players.values()) {
    if (player.disconnected || !player.alive || player.hasRapidfire) continue;
    
    for (const rapidfire of room.rapidfires.values()) {
      const dist = Math.hypot(player.x - rapidfire.x, player.y - rapidfire.y);
      if (dist <= PLAYER_RADIUS + RAPIDFIRE_RADIUS) {
        toDelete.push(rapidfire.id);
        player.hasRapidfire = true;
        player.rapidfireExpiresAt = now + RAPIDFIRE_DURATION_MS;
        player.lastRapidfireShot = now; // Start firing immediately
        break; // Only one rapidfire per player at a time
      }
    }
  }
  for (const id of toDelete) {
    room.rapidfires.delete(id);
  }
}

function handleRapidfireExpiration(room, now) {
  // Check if any player's rapidfire has expired
  for (const player of room.players.values()) {
    if (player.hasRapidfire && now >= player.rapidfireExpiresAt) {
      player.hasRapidfire = false;
      player.rapidfireExpiresAt = 0;
      player.lastRapidfireShot = 0;
    }
  }
}

function handleRapidfireAutoShoot(room, now) {
  // Auto-shoot for players with active rapidfire
  for (const player of room.players.values()) {
    if (player.disconnected || !player.alive || !player.hasRapidfire) continue;
    
    // Check if enough time has passed since the last shot
    if (now - player.lastRapidfireShot >= RAPIDFIRE_INTERVAL_MS) {
      player.lastRapidfireShot = now;
      
      // Spawn a bullet
      // Determine direction - use input direction if moving, otherwise face right
      let dirX = player.inputDir.x;
      let dirY = player.inputDir.y;
      const magnitude = Math.hypot(dirX, dirY);
      
      if (magnitude < 0.01) {
        // If not moving, shoot in the direction the player is facing (right by default)
        dirX = 1;
        dirY = 0;
      } else {
        // Normalize direction
        dirX /= magnitude;
        dirY /= magnitude;
      }
      
      const bulletId = crypto.randomBytes(6).toString('hex');
      room.bullets.set(bulletId, {
        id: bulletId,
        ownerId: player.id,
        x: player.x + dirX * PLAYER_RADIUS, // Spawn slightly ahead of player
        y: player.y + dirY * PLAYER_RADIUS,
        vx: dirX * BULLET_SPEED,
        vy: dirY * BULLET_SPEED,
        createdAt: now,
        expiresAt: now + BULLET_LIFETIME_MS,
      });
    }
  }
}

function updateBullets(room, now, delta) {
  const toDelete = [];
  
  for (const bullet of room.bullets.values()) {
    // Check if bullet expired
    if (now >= bullet.expiresAt) {
      toDelete.push(bullet.id);
      continue;
    }
    
    // Move bullet
    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;
    
    // Remove bullets that go out of bounds
    if (bullet.x < 0 || bullet.x > MAP_WIDTH || bullet.y < 0 || bullet.y > MAP_HEIGHT) {
      toDelete.push(bullet.id);
    }
  }
  
  for (const id of toDelete) {
    room.bullets.delete(id);
  }
}

function handleBulletCollisions(room, now) {
  const bulletsToDelete = [];
  
  for (const bullet of room.bullets.values()) {
    let hitSomething = false;
    
    // Check collision with players (not the owner)
    for (const player of room.players.values()) {
      if (player.id === bullet.ownerId || player.disconnected || !player.alive) continue;
      
      const dist = Math.hypot(player.x - bullet.x, player.y - bullet.y);
      if (dist <= PLAYER_RADIUS + BULLET_RADIUS) {
        // Hit player - kill them
        if (room.config.deathPenaltyEnabled) {
          player.score = Math.max(0, player.score - 1);
        }
        player.alive = false;
        player.respawnAt = now + RESPAWN_MS;
        
        // Give score to shooter
        const shooter = room.players.get(bullet.ownerId);
        if (shooter) {
          shooter.score += 2;
          if (checkWin(room, shooter)) {
            bulletsToDelete.push(bullet.id);
            hitSomething = true;
            break;
          }
        }
        
        hitSomething = true;
        break;
      }
    }
    
    if (hitSomething) {
      bulletsToDelete.push(bullet.id);
      continue;
    }
    
    // Check collision with enemies
    for (const enemy of room.enemies.values()) {
      if (enemy.respawnAt && now < enemy.respawnAt) continue;
      
      const dist = Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y);
      if (dist <= ENEMY_RADIUS + BULLET_RADIUS) {
        // Hit enemy - respawn it after 6 seconds
        enemy.respawnAt = now + 6000;
        
        // Give score to shooter
        const shooter = room.players.get(bullet.ownerId);
        if (shooter) {
          shooter.score += 1;
          if (checkWin(room, shooter)) {
            bulletsToDelete.push(bullet.id);
            hitSomething = true;
            break;
          }
        }
        
        hitSomething = true;
        break;
      }
    }
    
    if (hitSomething) {
      bulletsToDelete.push(bullet.id);
    }
  }
  
  for (const id of bulletsToDelete) {
    room.bullets.delete(id);
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
            enemy.respawnAt = now + 6000;
            return;
          }
          enemy.respawnAt = now + 6000;
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
    gameStartedAt: room.gameStartedAt, // Send game start time (null if not started)
    players: Array.from(room.players.values())
      .filter(p => !p.disconnected) // Don't show disconnected players in lobby
      .map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        score: p.score,
        spaceship: p.spaceship,
      })),
  };
}

function serializeGame(room) {
  return {
    id: room.id,
    state: room.state,
    config: room.config,
    gameStartedAt: room.gameStartedAt,
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
        hasPowerup: p.hasPowerup,
        hasRapidfire: p.hasRapidfire,
        spaceship: p.spaceship,
        aim: typeof p.aim === 'number' ? p.aim : null,
      })),
    coins: Array.from(room.coins.values()).map((c) => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y) })),
    enemies: Array.from(room.enemies.values()).map((e) => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), active: !e.respawnAt })),
    powerups: Array.from(room.powerups.values()).map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })),
    rapidfires: Array.from(room.rapidfires.values()).map((r) => ({ id: r.id, x: Math.round(r.x), y: Math.round(r.y) })),
    bullets: Array.from(room.bullets.values()).map((b) => ({ 
      id: b.id, 
      x: Math.round(b.x), 
      y: Math.round(b.y), 
      vx: b.vx, 
      vy: b.vy 
    })),
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
      spaceship: p.spaceship,
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
    const timeoutMs = room.config.roomTimeoutMinutes * 60000;
    const inactiveMs = now - room.lastActive;
    
    if (inactiveMs > timeoutMs) {
      console.log(`Sweeping room ${id} - inactive for ${Math.floor(inactiveMs / 60000)} minutes (timeout: ${room.config.roomTimeoutMinutes} minutes)`);
      
      // Notify all players in the room before deletion
      broadcast(room, {
        type: 'error',
        message: `Room has expired due to inactivity (${room.config.roomTimeoutMinutes} minutes).`
      });
      
      // Close all connections
      room.players.forEach((player) => {
        if (player.connection && player.connection.readyState === player.connection.OPEN) {
          player.connection.close();
        }
      });
      
      rooms.delete(id);
    }
  });
}
