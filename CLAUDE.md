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

- **One integer encodes piece type and color.** Board cells and piece-shape cells hold `0` (empty) or `1–8` (8 is the "Tuerca" challenge piece, a 3×3 ring with an empty center); that same number indexes both `PIECES` and the active skin's `colors` array (index 0 is `null` in both; `COLORS` is the retro palette). `merge()` copies shape values straight into the board, so rendering needs no extra lookup.
- **Global mutable state.** `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, etc. are module-level `let`s, reset entirely in `init()` (also the restart button handler).
- **Piece lifecycle:** `lockPiece()` → `merge()` → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next` to `current`; if it collides immediately, `endGame()`).
- **Game loop:** `loop()` runs on `requestAnimationFrame`, accumulating `dt` into `dropAccum` and stepping the piece down when it exceeds `dropInterval`. Pause and game over stop it via `cancelAnimationFrame(animId)`; resuming resets `lastTime` and calls `loop` again.
- **Rotation:** `rotateCW()` is a pure matrix rotation; `tryRotate()` applies simple horizontal wall kicks `[0, -1, 1, -2, 2]` (not SRS).
- **Collision:** `collide(shape, ox, oy)` allows `ny < 0` (cells above the board) but rejects side/bottom bounds and occupied cells. It is reused for movement, drops, ghost piece (`ghostY()`), and spawn checks.
- **Rendering:** `drawBlock()` is shared between the main board and the next-piece preview (it takes the context and cell size). The ghost piece is drawn with alpha `0.2`.
- **Skins:** `SKINS` (`retro`, `neon`, `pastel`, `pixel`) each hold `colors` (same indexing as `PIECES`) and a `draw(context, px, py, color, size, alpha)` function; `drawBlock()` sets `globalAlpha` and dispatches to the active `skin`. Skin draw functions must leave the context clean (neon resets `shadowBlur`/`shadowColor`). Optional `bg`/`grid` override the theme: `applySkinCanvas()` sets `gridColor`, `canvasBgColor` and the canvases' inline `style.background`, and `applyTheme()` calls it after reading CSS vars so theme and skin compose in any order. `applySkin()` persists under `tetris-skin` and redraws even when paused/game over; `init()` does not reset it. The keydown handler ignores events targeting `#skin-select`.
- **HUD/overlay:** `updateHUD()` writes to the `#score/#lines/#level` spans; the `#overlay` element is reused for both PAUSA and GAME OVER by toggling the `hidden` class and changing its text.

## Coupled constants

`COLS`, `ROWS`, and `BLOCK` in `game.js` must match the `<canvas id="board">` size in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`, currently 300×600). The `#next-canvas` (120×120) assumes a 4×4 grid of 30px cells, matching `NB` and the centering math in `drawNext()`.
