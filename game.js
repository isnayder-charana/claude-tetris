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
const gameoverExtra = document.getElementById('gameover-extra');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const overlayRecords = document.getElementById('overlay-records');
const overlayResetBtn = document.getElementById('overlay-reset-btn');
const startScreen = document.getElementById('start-screen');
const startRecords = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const startResetBtn = document.getElementById('start-reset-btn');

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
  } else {
    drawEmptyBoard(); // pantalla de inicio: aún no hay partida
  }
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo: piezas seguidas que completan línea; effects: animaciones de líneas en curso
let combo, effects;
// maxCombo: mejor combo de la partida; pendingRecord: puntuación esperando nombre
let maxCombo, pendingRecord;

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const PLAYER_KEY = 'tetris-player';
const MAX_RECORDS = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'JUGADOR';

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Tolera JSON ausente o corrupto: en ese caso devuelve records vacíos
function loadRecords() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(RECORDS_KEY));
  } catch {
    return emptyRecords();
  }
  if (!data || typeof data !== 'object') return emptyRecords();
  const scores = (Array.isArray(data.scores) ? data.scores : [])
    .filter(s => s && typeof s === 'object')
    .map(s => ({
      name: (typeof s.name === 'string' ? s.name.slice(0, NAME_MAX) : '') || DEFAULT_NAME,
      score: toCount(s.score),
      lines: toCount(s.lines),
      level: toCount(s.level) || 1,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
  return { scores, bestCombo: toCount(data.bestCombo), maxLines: toCount(data.maxLines) };
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch {}
}

function savedPlayerName() {
  try {
    return localStorage.getItem(PLAYER_KEY) || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

function qualifies(rec, value) {
  if (value <= 0) return false;
  return rec.scores.length < MAX_RECORDS || value > rec.scores[rec.scores.length - 1].score;
}

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text; // textContent: el nombre nunca se interpreta como HTML
  if (cls) node.className = cls;
  return node;
}

// hl: { row, combo, lines } marca la fila nueva y los récords recién batidos
// rec se pasa ya cargado: si localStorage falla, la tabla muestra igualmente lo de esta partida
function renderRecords(container, rec, hl = {}) {
  container.replaceChildren();
  if (!rec.scores.length) {
    container.append(el('p', 'Aún no hay records', 'empty'));
  } else {
    const table = el('table');
    const head = el('tr');
    head.append(el('th', '#', 'num'), el('th', 'Nombre'), el('th', 'Puntos', 'num'), el('th', 'Líneas', 'num'));
    table.append(head);
    rec.scores.forEach((s, i) => {
      const tr = el('tr', undefined, i === hl.row ? 'highlight' : '');
      tr.append(el('td', String(i + 1), 'num'), el('td', s.name),
        el('td', s.score.toLocaleString(), 'num'), el('td', String(s.lines), 'num'));
      table.append(tr);
    });
    container.append(table);
  }
  const stats = el('div', undefined, 'records-stats');
  stats.append(
    el('span', `Mejor combo: x${rec.bestCombo}`, hl.combo ? 'highlight' : ''),
    el('span', `Líneas máx.: ${rec.maxLines}`, hl.lines ? 'highlight' : ''),
  );
  container.append(stats);
}

let gameOverHighlight = {};

function saveScore() {
  if (!pendingRecord) return;
  const name = nameInput.value.trim().slice(0, NAME_MAX) || DEFAULT_NAME;
  try { localStorage.setItem(PLAYER_KEY, name); } catch {}
  const entry = { ...pendingRecord, name };
  pendingRecord = null;
  const rec = loadRecords();
  rec.scores.push(entry);
  rec.scores.sort((a, b) => b.score - a.score);
  rec.scores = rec.scores.slice(0, MAX_RECORDS);
  saveRecords(rec);
  const row = rec.scores.indexOf(entry);
  gameOverHighlight = { ...gameOverHighlight, row: row >= 0 ? row : undefined };
  nameInput.blur();
  nameForm.hidden = true;
  renderRecords(overlayRecords, rec, gameOverHighlight);
}

function resetRecords() {
  if (!confirm('¿Borrar todos los records? Esta acción no se puede deshacer.')) return;
  const rec = emptyRecords();
  saveRecords(rec);
  gameOverHighlight = {};
  renderRecords(startRecords, rec);
  if (!gameoverExtra.hidden) renderRecords(overlayRecords, rec);
}

function showStartScreen() {
  renderRecords(startRecords, loadRecords());
  startScreen.classList.remove('hidden');
  playBtn.focus();
}

function startGame() {
  unlockAudio();
  startScreen.classList.add('hidden');
  playBtn.blur();
  init();
}

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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
    combo++;
    if (combo >= 2 && combo > maxCombo) maxCombo = combo; // combo cuenta desde x2, como el texto en pantalla
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

function drawEmptyBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
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

  // Mejor combo y líneas máximas se actualizan siempre, entre o no en el top
  const rec = loadRecords();
  gameOverHighlight = { combo: maxCombo > rec.bestCombo, lines: lines > rec.maxLines };
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);

  pendingRecord = qualifies(rec, score) ? { score, lines, level } : null;
  nameForm.hidden = !pendingRecord;
  renderRecords(overlayRecords, rec, gameOverHighlight);
  gameoverExtra.hidden = false;
  overlayResetBtn.hidden = false;
  overlay.classList.remove('hidden');
  if (pendingRecord) {
    nameInput.value = savedPlayerName();
    nameInput.focus();
    nameInput.select();
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  pendingRecord = null;
  gameOverHighlight = {};
  gameoverExtra.hidden = true;
  overlayResetBtn.hidden = true;
  effects = [];
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Escribiendo el nombre: las teclas no son controles del juego
  if (e.target instanceof HTMLInputElement) {
    // Space mantenido desde el hard drop final no debe llenar el nombre de espacios
    if (e.repeat && e.code === 'Space') e.preventDefault();
    return;
  }
  unlockAudio();
  if (!current) return; // pantalla de inicio: aún no hay partida
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', () => {
  if (pendingRecord) saveScore(); // reiniciar sin pulsar Guardar no pierde el récord
  init();
  restartBtn.blur();
});

playBtn.addEventListener('click', startGame);

nameInput.maxLength = NAME_MAX;

nameForm.addEventListener('submit', e => {
  e.preventDefault(); // Enter en el campo también guarda
  saveScore();
});

[startResetBtn, overlayResetBtn].forEach(btn => btn.addEventListener('click', () => {
  resetRecords();
  btn.blur();
}));

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space/Enter vuelvan a activar el botón
});

applyTheme(savedTheme());
showStartScreen();
