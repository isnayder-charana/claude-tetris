'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (reto: hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const LINE_LABELS = ['', '', '¡DOBLE!', '¡TRIPLE!', '¡TETRIS!'];
const FLASH_MS = 350;
const TEXT_MS = 900;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

// ---- Menú de pausa ----
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 10;

function savedStartLevel() {
  try {
    const n = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
    return n >= 1 && n <= MAX_START_LEVEL ? n : 1;
  } catch {
    return 1;
  }
}

// startLevel: preferencia para la PRÓXIMA partida; init() la copia en gameStartLevel
let startLevel = savedStartLevel();
let gameStartLevel = startLevel;
// Tras cerrar el menú se ignoran las repeticiones de una tecla mantenida
let ignoreRepeat = false;

const themeToggle = document.getElementById('theme-toggle');
const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';
let flashColor = '#ffffff';
let accentColor = '#7aa2f7';
let canvasBgColor = '#1a1a25';

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

// El tema no forma parte del estado de la partida: init() no lo reinicia.
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); } catch {}
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.textContent = isLight ? '🌙 Oscuro' : '☀️ Claro';
  const css = getComputedStyle(document.documentElement);
  gridColor = css.getPropertyValue('--grid').trim();
  flashColor = css.getPropertyValue('--flash').trim();
  accentColor = css.getPropertyValue('--accent').trim();
  canvasBgColor = css.getPropertyValue('--canvas-bg').trim();
  // Redibuja aunque el bucle esté detenido (pausa / game over)
  if (board && current && next) {
    draw();
    drawNext();
  }
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo: piezas seguidas que completan línea; effects: animaciones de líneas en curso
let combo, effects;

// ---- Sonido (Web Audio, sin archivos) ----
let audioCtx = null;

// Los navegadores solo permiten arrancar el audio tras un gesto del usuario
function unlockAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function tone(freq, start, dur, type, gain) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + dur);
}

// Arpegio de una nota por línea; cada eslabón del combo sube el tono 2 semitonos
function playClearSound(cleared, chain) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const t = audioCtx.currentTime;
  const base = 440 * Math.pow(2, Math.min(chain - 1, 8) * 2 / 12);
  const steps = [0, 4, 7, 12];
  for (let i = 0; i < cleared; i++)
    tone(base * Math.pow(2, steps[i] / 12), t + i * 0.06, 0.18, 'square', 0.06);
  if (cleared === 4) tone(base * 2, t + 0.24, 0.45, 'triangle', 0.1);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Velocidad de caída (ms) según el nivel
function intervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function clearLines() {
  let cleared = 0;
  const rows = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      rows.push(r - cleared); // posición original, antes de desplazar el tablero
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = gameStartLevel + Math.floor(lines / 10);
    dropInterval = intervalForLevel(level);
    updateHUD();
    combo++;
    addLineEffect(rows, cleared);
    playClearSound(cleared, combo);
  } else {
    combo = 0;
  }
}

function addLineEffect(rows, cleared) {
  const texts = [];
  if (LINE_LABELS[cleared]) texts.push(LINE_LABELS[cleared]);
  if (combo >= 2) texts.push(`COMBO x${combo}`);
  const centerY = (Math.min(...rows) + Math.max(...rows) + 1) / 2 * BLOCK;
  effects.push({ rows, texts, centerY, start: performance.now() });
}

function drawEffects() {
  const now = performance.now();
  effects = effects.filter(e => now - e.start < TEXT_MS);
  for (const e of effects) {
    const t = now - e.start;

    // destello de las filas eliminadas
    if (t < FLASH_MS) {
      const k = t / FLASH_MS;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = flashColor;
      const grow = k * BLOCK * 0.4;
      for (const r of e.rows)
        ctx.fillRect(0, r * BLOCK - grow / 2, COLS * BLOCK, BLOCK + grow);
    }

    // texto flotante
    if (e.texts.length) {
      const k = t / TEXT_MS;
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.font = `800 ${24 + 4 * e.rows.length}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = canvasBgColor;
      ctx.fillStyle = accentColor;
      const y = e.centerY - k * 40;
      e.texts.forEach((txt, i) => {
        const ty = y + (i - (e.texts.length - 1) / 2) * 32;
        ctx.strokeText(txt, COLS * BLOCK / 2, ty);
        ctx.fillText(txt, COLS * BLOCK / 2, ty);
      });
    }
  }
  ctx.globalAlpha = 1;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.3)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  drawEffects();
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function setControlsVisible(visible) {
  pauseControls.classList.toggle('hidden', !visible);
  controlsBtn.setAttribute('aria-expanded', String(visible));
  controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
}

// Cierra el menú sin tocar el bucle (lo usan togglePause e init)
function hidePauseMenu() {
  pauseMenu.classList.add('hidden');
  // Quita el foco para que Space/Enter no vuelvan a activar un botón del menú
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
}

// Mantiene el foco del Tab dentro del menú mientras está abierto
function trapMenuFocus(e) {
  const items = [resumeBtn, pauseRestartBtn, controlsBtn, startLevelSelect];
  const i = items.indexOf(document.activeElement);
  const n = items.length;
  const to = i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n;
  items[to].focus();
  e.preventDefault();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    ignoreRepeat = true;
    dropAccum = 0;
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    setControlsVisible(false);
    pauseMenu.classList.remove('hidden');
    resumeBtn.focus({ preventScroll: true });
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() no puede cancelar el frame en curso: hay que cortar el bucle aquí
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel; // un cambio a mitad de partida no altera la actual
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  effects = [];
  dropInterval = intervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hidePauseMenu();
  ignoreRepeat = true;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  unlockAudio();
  const mod = e.ctrlKey || e.metaKey || e.altKey; // no bloquear Ctrl+P (imprimir)
  // Esc sobre el selector solo cierra su desplegable
  const escOnSelect = e.code === 'Escape' && e.target === startLevelSelect;
  if ((e.code === 'KeyP' || e.code === 'Escape') && !mod && !escOnSelect) {
    if (!e.repeat) togglePause();
    e.preventDefault();
    return;
  }
  // Con el menú abierto las teclas no llegan al juego (solo Tab/Enter/selector)
  if (paused) {
    if (e.code === 'Tab') trapMenuFocus(e);
    return;
  }
  if (gameOver) return;
  if (!e.repeat) ignoreRepeat = false;
  if (ignoreRepeat) { if (e.code === 'Space') e.preventDefault(); return; }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => {
  setControlsVisible(pauseControls.classList.contains('hidden'));
});

for (let n = 1; n <= MAX_START_LEVEL; n++) startLevelSelect.add(new Option(String(n), String(n)));
startLevelSelect.value = String(startLevel);
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10) || 1;
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch {}
});

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space/Enter vuelvan a activar el botón
});

init();
applyTheme(savedTheme());
