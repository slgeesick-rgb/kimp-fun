# Kimp Fun

Kimp Fun is a lightweight real-time multiplayer adventure built with plain HTML5 Canvas on the frontend and a vanilla Node.js WebSocket server. Up to 24 players can share a lobby, race to collect items, defeat roaming enemies, and be the first to reach the target score.

## Features

- Pure HTML, CSS, and vanilla JavaScript client with responsive controls for desktop and mobile (virtual joystick + dash button).
- Server-authoritative gameplay loop with configurable room settings (target score, max players, timeouts, passcodes, and death penalties).
- Lightweight WebSocket protocol (no Socket.IO) with 30 Hz state snapshots and optimistic client-side rendering.
- Lobby management with shareable deep links (`/play/<roomId>?name=...`), unique display names, passcode support, and host controls.
- Winner announcement, results screen, and immediate rematch using the same lobby link.
- Accessibility options including mute toggle, low-graphics mode, and high-contrast palette based on the Kimp Fun brand colors.

## Project structure

```
server.js           # HTTP + WebSocket server
package.json        # npm manifest (ws dependency only)
.htaccess           # Apache proxy configuration (for cPanel)
public/
  index.html        # Single-page UI (splash, lobby, game, results)
  styles.css        # Brand styling and responsive layout
  app.js            # UI state, networking, canvas rendering, input loop
```

## Requirements

- Node.js 18+ (uses native ES modules and WebSocket timers).
- npm (to install the single dependency, `ws`).

## Getting started

```pwsh
# Install dependencies
npm install

# Start the server (defaults to port 3000)
npm start
```

Open your browser at `http://localhost:3000/` and either create a game or join an existing link.

### Environment variables

- `PORT` &mdash; overrides the default HTTP/WebSocket port (3000).

Example:

```pwsh
$env:PORT = 8080
npm start
```

## Gameplay overview

1. **Create a room**: choose a display name, target score (default 50), max players (default 24), optional passcode, and timeout options.
2. **Share the link**: copy the generated `/play/<roomId>` URL and send it to friends. Query parameters like `?name=Player` can pre-fill the join form.
3. **Lobby**: players enter unique names (auto-filtered for profanity) and appear in the roster. The host can start once at least two players are present.
4. **Match**: move with WASD/arrow keys (or the virtual joystick), dash with Space/click/touch, collect coins (+1) and defeat enemies while dashing (+2). Optional death penalties subtract 1 point and trigger a quick respawn.
5. **Victory**: as soon as a player hits the target score, the match freezes and the results screen announces the winner. The host can trigger an instant rematch using the same lobby.

## Configuration knobs

The server applies the following defaults, which the host can override during room creation:

| Option | Default | Notes |
| --- | --- | --- |
| `targetScore` | 50 | 10&ndash;500 points |
| `maxPlayers` | 24 | 2&ndash;48 players |
| `roomTimeoutMinutes` | 10 | Rooms with no players are purged after this idle period |
| `passcodeEnabled` | true | Toggle whether passcodes are required |
| `deathPenaltyEnabled` | true | If disabled, deaths only cause a brief respawn |

## Deployment

Any basic Node.js hosting environment works. Example VM steps:

1. Install Node.js 18+ on the VM.
2. Copy this repository to the server (e.g., via Git or `scp`).
3. Run `npm install` to fetch the `ws` dependency.
4. Start the server with `PORT=80 node server.js` (or use a process manager such as `pm2` or systemd to keep it alive).
5. Ensure firewall rules expose the chosen port and that your reverse proxy (if any) forwards both HTTP and WebSocket traffic to the Node.js process.

The server serves the static frontend and the WebSocket endpoint from the same origin, so no additional configuration is required beyond opening the port.

## Testing tips

- Open multiple browser tabs (or devices) using the lobby link to simulate concurrent players.
- Use the low-graphics toggle on lower-powered devices to reduce background rendering.
- Confirm that attempting to reuse a display name or join a full room results in an error banner.
- Use the results screen "Play Again" button to verify rematch flows without regenerating the link.
