# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build step, no tests, no linter. UI text and the README are in Spanish; keep user-facing strings in Spanish.

## Running

Open `index.html` directly, or serve the folder statically (preferred):

```bash
python -m http.server 8000   # then open http://localhost:8000
npx serve .
```

There is no automated test suite; verify changes by playing in the browser.

## Architecture

Three files: `index.html` (DOM + two canvases + overlay), `style.css` (dark theme), and `game.js` (all logic, a single non-module script loaded at the end of `<body>`, so it reads DOM elements at top level).

Key points in `game.js` that span multiple functions:

- **One integer encodes piece type and color.** Board cells and piece-shape cells hold `0` (empty) or `1–8` (8 is the "Tuerca" challenge piece, a 3×3 ring with an empty center); that same number indexes both `PIECES` and `COLORS` (index 0 is `null` in both). `merge()` copies shape values straight into the board, so rendering needs no extra lookup.
- **Global mutable state.** `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, etc. are module-level `let`s, reset entirely in `init()` (also the restart button handler).
- **Piece lifecycle:** `lockPiece()` → `merge()` → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next` to `current`; if it collides immediately, `endGame()`).
- **Game loop:** `loop()` runs on `requestAnimationFrame`, accumulating `dt` into `dropAccum` and stepping the piece down when it exceeds `dropInterval`. Pause and game over stop it via `cancelAnimationFrame(animId)`; resuming resets `lastTime` and calls `loop` again.
- **Rotation:** `rotateCW()` is a pure matrix rotation; `tryRotate()` applies simple horizontal wall kicks `[0, -1, 1, -2, 2]` (not SRS).
- **Collision:** `collide(shape, ox, oy)` allows `ny < 0` (cells above the board) but rejects side/bottom bounds and occupied cells. It is reused for movement, drops, ghost piece (`ghostY()`), and spawn checks.
- **Rendering:** `drawBlock()` is shared between the main board and the next-piece preview (it takes the context and cell size). The ghost piece is drawn with alpha `0.2`.
- **HUD/overlay:** `updateHUD()` writes to the `#score/#lines/#level` spans; the `#overlay` element is used only for GAME OVER (toggling the `hidden` class).
- **Pause menu:** `P` or `Escape` call `togglePause()`, which shows/hides the separate `#pause-menu` overlay (Reanudar, Reiniciar → `init()`, Ver controles, Nivel inicial `<select id="start-level">`). While `paused`, the keydown handler returns before game keys (Tab is trapped inside the menu by `trapMenuFocus()`); P/Esc with Ctrl/Meta/Alt, and Esc on the select, are not intercepted. `hidePauseMenu()` (also called by `init()`) blurs any focused menu element. Resume and `init()` set `ignoreRepeat`, so held keys (`e.repeat`) are ignored until a fresh keydown; resuming also resets `dropAccum`.
- **Start level:** `startLevel` is the preference for the next game, persisted in `localStorage` key `tetris-start-level` (every access in try/catch). `init()` snapshots it into `gameStartLevel`; `clearLines()` computes `level = gameStartLevel + floor(lines / 10)`, and both use `intervalForLevel(level)` (`max(100, 1000 - (level - 1) * 90)`) for `dropInterval`. Changing the select mid-game does not affect the current game.

## Coupled constants

`COLS`, `ROWS`, and `BLOCK` in `game.js` must match the `<canvas id="board">` size in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`, currently 300×600). The `#next-canvas` (120×120) assumes a 4×4 grid of 30px cells, matching `NB` and the centering math in `drawNext()`.
