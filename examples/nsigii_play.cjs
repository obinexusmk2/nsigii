#!/usr/bin/env node
'use strict';
/**
 * NSIGII terminal player — dependency-free Node.js port of nsigii_play.py.
 * Usage: node nsigii_play.cjs video.nsigii [--fps 25] [--gray] [--loop]
 *        node nsigii_play.cjs video.nsigii --info [--sample 3]
 *        node nsigii_play.cjs object.nsigii --no-spin
 *
 * Codec header (32 bytes, LE): magic[8], version[8], width:u32,
 * height:u32, declaredFrames:u32, reserved:u32. Then length:u32 + raw DEFLATE.
 * Video: I420 (even dimensions); versions ending A: char|r|g|b planes.
 * ASCII reserved: high 16 bits = grid A, low 16 bits = grid B.
 * Reads to EOF, including when declaredFrames is zero; incomplete tails stop.
 *
 * Keys: q/Esc/Ctrl-Z/Ctrl-C quit; space pause / toggle ASCII idle spin;
 * ASCII: r resets, mouse rotates, arrow keys provide a mouse-free fallback.
 * ANSI/true-colour terminal required. Mouse reports depend on the terminal;
 * Node's built-in API cannot explicitly configure Windows QuickEdit/VT input.
 * No shell commands or payload code are executed.
 *
 * Port improvements: bounded inflation/grid memory, fragmented escape parsing,
 * terminal resize handling, control-character filtering in ASCII payloads,
 * correct negative-angle wrapping, and no busy loop for empty looped videos.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { performance } = require('node:perf_hooks');
const { setTimeout: sleep } = require('node:timers/promises');

const HDR_SIZE = 32;
const MAX_FRAME_BYTES = 256 * 1024 * 1024;
const MAX_GRID_BYTES = 512 * 1024 * 1024;
const ESC = { home: '\x1b[H', clear: '\x1b[2J', reset: '\x1b[0m',
  hide: '\x1b[?25l', show: '\x1b[?25h', mouseOn: '\x1b[?1003h\x1b[?1006h',
  mouseOff: '\x1b[?1006l\x1b[?1003l' };
const GAIN_MIN = 2.5, GAIN_MAX = 5, SPEED_REF = 60;
const RAD_PER_CELL = 0.0314, IDLE_SPIN = 0.9, TAU = 2 * Math.PI;
const now = () => performance.now() / 1000;
const mod = (n, d) => ((n % d) + d) % d;
const fmt = n => n.toLocaleString('en-US');
class NsigiiError extends Error {}

// Positional reads keep each iterator independent of header/tail probing.
function readAt(fd, size, position) {
  const buf = Buffer.allocUnsafe(size);
  let got = 0;
  while (got < size) {
    const n = fs.readSync(fd, buf, got, size - got, position + got);
    if (!n) break;
    got += n;
  }
  return buf.subarray(0, got);
}
function payloadKind(version) { return version.endsWith('A') ? 'ascii' : 'video'; }
function detectVariant(head, fd) {
  if (head[7] === 7) return 'wrapped';
  const size = fs.fstatSync(fd).size;
  const tail = readAt(fd, Math.min(size, 4096), Math.max(0, size - 4096));
  return tail.includes(Buffer.from('ENDNSIGII')) || tail.includes(Buffer.from('ENDSIGII'))
    ? 'wrapped' : 'codec';
}
function readHeader(fd, filename) {
  const h = readAt(fd, HDR_SIZE, 0);
  if (h.length < HDR_SIZE) throw new NsigiiError('file is shorter than the 32-byte header');
  if (h.subarray(0, 6).toString('ascii') !== 'NSIGII')
    throw new NsigiiError('bad magic — expected NSIGII');
  if (detectVariant(h, fd) === 'wrapped') {
    const name = JSON.stringify(path.basename(filename));
    throw new NsigiiError('this is a CONSTITUTIONAL WRAPPER, not a codec stream. Unwrap first:\n\n' +
      `  npx nsigii inspect ${name}\n  npx nsigii extract ${name}\n\n` +
      'Then play the extracted codec payload with this script.');
  }
  const version = h.subarray(8, 16).toString('ascii').replace(/\0+$/, '');
  const width = h.readUInt32LE(16), height = h.readUInt32LE(20);
  const declared = h.readUInt32LE(24), reserved = h.readUInt32LE(28);
  const kind = payloadKind(version);
  if (!width || !height) throw new NsigiiError(`unusable dimensions ${width}x${height}`);
  const expected = width * height * (kind === 'ascii' ? 4 : 1.5);
  if (!Number.isSafeInteger(expected) || expected > MAX_FRAME_BYTES)
    throw new NsigiiError('dimensions exceed the supported 256 MiB frame limit');
  if (kind === 'video' && (width % 2 || height % 2))
    throw new NsigiiError('I420 video requires even width and height');
  return { version, width, height, declared, reserved, kind, expected };
}
function probe(filename) {
  const fd = fs.openSync(filename, 'r');
  try { return readHeader(fd, filename); } finally { fs.closeSync(fd); }
}
function* iterFrames(fd) {
  let position = HDR_SIZE, index = 0;
  const fileSize = fs.fstatSync(fd).size;
  while (position + 4 <= fileSize) {
    const raw = readAt(fd, 4, position);
    if (raw.length < 4) return;
    const size = raw.readUInt32LE(0);
    position += 4;
    if (!size) { index++; continue; }
    if (size > fileSize - position) return; // Incomplete final record.
    if (size > MAX_FRAME_BYTES) throw new NsigiiError(`frame ${index} exceeds compressed size limit`);
    const blob = readAt(fd, size, position);
    if (blob.length !== size) return;
    position += size;
    let data;
    try { data = zlib.inflateRawSync(blob, { maxOutputLength: MAX_FRAME_BYTES }); }
    catch (err) { throw new NsigiiError(`frame ${index} failed to inflate (${err.message})`); }
    yield { index, size, data };
    index++;
  }
}

// Python-compatible ties-to-even rounding for colour tables and sizing.
function round(n) {
  const f = Math.floor(n), r = n - f;
  return r === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(n);
}
const RV = Int16Array.from({ length: 256 }, (_, i) => round(1.402 * (i - 128)));
const BU = Int16Array.from({ length: 256 }, (_, i) => round(1.772 * (i - 128)));
const GUV = Int16Array.from({ length: 65536 }, (_, i) =>
  round(-0.344136 * ((i >> 8) - 128) - 0.714136 * ((i & 255) - 128)));
const clamp = n => Math.max(0, Math.min(255, n));
const nnMap = (src, dst) => Array.from({ length: dst }, (_, i) => Math.min(src - 1, Math.floor(i * src / dst)));
function terminalSize() {
  return { cols: Math.max(1, process.stdout.columns || 80), rows: Math.max(2, process.stdout.rows || 24) };
}
function fitToTerminal(width, height) {
  const { cols, rows } = terminalSize();
  const maxH = (rows - 1) * 2;
  let outW = cols, outH = round(cols * height / width);
  if (outH > maxH) { outH = maxH; outW = round(maxH * width / height); }
  outW = Math.max(1, Math.min(outW, cols));
  outH = Math.max(2, outH);
  if (outH % 2) outH++;
  return { cols, rows, outW, outH, xmap: nnMap(width, outW), ymap: nnMap(height, outH) };
}
function renderFrame(buf, width, height, xmap, ymap, gray) {
  const ySize = width * height, cw = width / 2, cSize = ySize / 4;
  if (buf.length < ySize) return null;
  const colour = !gray && buf.length >= ySize + cSize * 2;
  function pixel(x, y) {
    const Y = buf[y * width + x];
    if (!colour) return `${Y};${Y};${Y}`;
    const ci = (y >> 1) * cw + (x >> 1);
    const u = buf[ySize + ci], v = buf[ySize + cSize + ci];
    return `${clamp(Y + RV[v])};${clamp(Y + GUV[(u << 8) | v])};${clamp(Y + BU[u])}`;
  }
  const out = [];
  for (let r = 0; r < Math.floor(ymap.length / 2); r++) {
    out.push(`\x1b[${r + 1};1H`);
    let lastFg = null, lastBg = null;
    for (const x of xmap) {
      const fg = pixel(x, ymap[r * 2]), bg = pixel(x, ymap[r * 2 + 1]);
      if (fg !== lastFg) { out.push(`\x1b[38;2;${fg}m`); lastFg = fg; }
      if (bg !== lastBg) { out.push(`\x1b[48;2;${bg}m`); lastBg = bg; }
      out.push('▀');
    }
    out.push(ESC.reset, '\x1b[K');
  }
  return out.join('');
}
function renderAscii(planes, w, h, cols = w, rows = h + 1) {
  const size = w * h;
  if (planes.length < size * 4) return null;
  const out = [];
  const dw = Math.min(w, cols), dh = Math.min(h, rows - 1);
  for (let row = 0; row < dh; row++) {
    out.push(`\x1b[${row + 1};1H`);
    let last = null;
    for (let col = 0; col < dw; col++) {
      const i = row * w + col, byte = planes[i];
      // Byte planes are ASCII. Never pass terminal controls through from files.
      const ch = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ' ';
      if (ch === ' ') {
        if (last !== null) out.push(ESC.reset);
        last = null; out.push(' '); continue;
      }
      const fg = `${planes[size + i]};${planes[size * 2 + i]};${planes[size * 3 + i]}`;
      if (fg !== last) { out.push(`\x1b[38;2;${fg}m`); last = fg; }
      out.push(ch);
    }
    out.push(ESC.reset, '\x1b[K');
  }
  return out.join('');
}

// Parse complete SGR mouse reports without confusing their ESC with quit.
class InputStream {
  constructor() { this.buf = ''; this.queue = []; this.timer = null; }
  feed(chunk) { this.buf += chunk.toString('latin1'); this.parse(); }
  parse() {
    clearTimeout(this.timer);
    while (this.buf) {
      if (this.buf[0] !== '\x1b') {
        this.queue.push({ kind: 'key', key: this.buf[0] }); this.buf = this.buf.slice(1); continue;
      }
      const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(this.buf);
      if (mouse) {
        this.queue.push({ kind: 'mouse', button: +mouse[1], x: +mouse[2], y: +mouse[3], pressed: mouse[4] === 'M' });
        this.buf = this.buf.slice(mouse[0].length); continue;
      }
      const csi = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(this.buf);
      const ss3 = /^\x1bO[A-D]/.exec(this.buf);
      if (csi || ss3) {
        const seq = (csi || ss3)[0], arrows = { A: 'up', B: 'down', C: 'right', D: 'left' };
        if (/^\x1b(?:\[|O)[A-D]$/.test(seq)) this.queue.push({ kind: 'key', key: arrows[seq.at(-1)] });
        this.buf = this.buf.slice(seq.length); continue;
      }
      if (this.buf.length <= 64 && (this.buf === '\x1b' || this.buf === '\x1bO' || /^\x1b\[[0-?]*[ -/]*$/.test(this.buf))) {
        this.timer = setTimeout(() => {
          this.queue.push({ kind: 'key', key: '\x1b' }); this.buf = ''; this.timer = null;
        }, 80);
        return;
      }
      this.queue.push({ kind: 'key', key: '\x1b' }); this.buf = this.buf.slice(1);
    }
  }
  events() { return this.queue.splice(0); }
  start() {
    this.wasRaw = Boolean(process.stdin.isRaw);
    this.wasFlowing = process.stdin.readableFlowing === true;
    this.onData = chunk => this.feed(chunk);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('data', this.onData);
    process.stdin.resume();
  }
  stop() {
    clearTimeout(this.timer);
    process.stdin.off('data', this.onData);
    if (process.stdin.isTTY) process.stdin.setRawMode(this.wasRaw);
    if (!this.wasFlowing) process.stdin.pause();
  }
}
const QUIT = new Set(['q', 'Q', '\x1b', '\x1a', '\x03']);
let outputError = null;
async function write(text) {
  if (outputError) throw outputError;
  await new Promise((resolve, reject) => process.stdout.write(text, err => err ? reject(err) : resolve()));
}
function status(text) {
  const { cols, rows } = terminalSize();
  return `\x1b[${rows};1H\x1b[2K${text.slice(0, cols)}`;
}
async function withTerminal(mouse, fn) {
  const input = new InputStream();
  const onSignal = () => input.queue.push({ kind: 'key', key: 'q' });
  const signals = ['SIGINT', 'SIGTERM'];
  if (process.platform !== 'win32') signals.push('SIGTSTP');
  try {
    input.start();
    for (const sig of signals) process.on(sig, onSignal);
    await write(ESC.hide + ESC.clear + (mouse ? ESC.mouseOn : ''));
    return await fn(input);
  } finally {
    input.stop();
    for (const sig of signals) process.off(sig, onSignal);
    if (!outputError) await write((mouse ? ESC.mouseOff : '') + ESC.reset + ESC.show + '\n');
  }
}

function doInfo(filename, sampleFrames) {
  const fd = fs.openSync(filename, 'r');
  try {
    const h = readHeader(fd, filename), { width: w, height: ht, kind, expected } = h;
    console.log(`file          ${path.basename(filename)}\nsize          ${fmt(fs.fstatSync(fd).size)} bytes`);
    console.log(`magic         NSIGII\nversion       ${h.version}\nkind          ${kind === 'ascii' ? 'interactive coloured ASCII' : 'I420 video timeline'}`);
    console.log(`dimensions    ${w}x${ht} ${kind === 'ascii' ? 'cells' : 'pixels'}\ndeclared      ${fmt(h.declared)} frames (header offset 24)`);
    if (kind === 'ascii') {
      const ga = h.reserved >>> 16, gb = h.reserved & 65535;
      console.log(`rotation grid ${ga}x${gb} (${(360 / Math.max(1, ga)).toFixed(1)} deg A, ${(360 / Math.max(1, gb)).toFixed(1)} deg B)`);
      console.log(`interaction   gain ${GAIN_MIN}..${GAIN_MAX}; reference ${SPEED_REF} cells/s`);
    }
    console.log(`reserved      0x${h.reserved.toString(16).padStart(8, '0')}\nframe payload ${fmt(expected)} bytes (${kind === 'ascii' ? 'char|r|g|b' : 'I420'})\n`);
    let count = 0, total = 0, smallest = Infinity, largest = 0, badSize = 0, failed = false;
    const zeroFracs = [], splitRows = [];
    try {
      for (const { size, data } of iterFrames(fd)) {
        count++; total += size; smallest = Math.min(smallest, size); largest = Math.max(largest, size);
        if (data.length !== expected) badSize++;
        if (kind !== 'ascii' && zeroFracs.length < sampleFrames && data.length >= w * ht) {
          const step = Math.max(1, Math.floor(w / 64));
          let zeros = 0, samples = 0, firstDead = null;
          for (let row = 0; row < ht; row++) {
            let nonzero = 0;
            for (let col = 0; col < w; col += step) {
              samples++; if (data[row * w + col] === 0) zeros++; else nonzero++;
            }
            if (!nonzero && firstDead === null) firstDead = row;
            else if (nonzero) firstDead = null;
          }
          if (samples) zeroFracs.push(zeros / samples);
          if (firstDead !== null) splitRows.push(firstDead);
        }
      }
    } catch (err) {
      if (!(err instanceof NsigiiError)) throw err;
      console.log(`!! ${err.message}\n`); failed = true;
    }
    console.log(`frames read   ${fmt(count)}`);
    if (h.declared && h.declared !== count) console.log(`              MISMATCH: header says ${fmt(h.declared)}`);
    if (!h.declared) console.log('              Header count is unpatched (0); frames were read to EOF.');
    if (badSize) console.log(`odd-sized     ${badSize} frames differ from expected length`);
    if (count) {
      console.log(`frame bytes   min ${fmt(smallest)} / mean ${fmt(Math.floor(total / count))} / max ${fmt(largest)} (compressed)`);
      console.log(`ratio         ${fmt(count * expected)} -> ${fmt(total)} (${(100 * total / (count * expected)).toFixed(2)}% of raw)`);
    }
    if (zeroFracs.length) {
      const mean = zeroFracs.reduce((a, b) => a + b, 0) / zeroFracs.length;
      console.log(`\nY-plane diagnostic (first ${zeroFracs.length} frames)\n  zero luma     ${(100 * mean).toFixed(1)}% of sampled pixels`);
      if (splitRows.length) {
        const split = splitRows.reduce((a, b) => a + b, 0) / splitRows.length;
        console.log(`  goes black at row ${Math.floor(split)} of ${ht} (${(100 * split / ht).toFixed(0)}% down the frame)`);
      }
      if (mean > 0.35) console.log('\n  Large zero-luma regions may indicate the rgbToYUV420 / ROPEN\n  buffer-length issue described in the original player, or genuine black\n  content. This diagnostic alone does not establish the cause.');
    }
    return failed ? 1 : 0;
  } finally { fs.closeSync(fd); }
}

async function doPlay(filename, options, h) {
  const interval = options.fps > 0 ? 1 / options.fps : 0;
  let shown = 0, dropped = 0, decoded = 0, quit = false, paused = false;
  let fit = fitToTerminal(h.width, h.height);
  await withTerminal(false, async input => {
    do {
      const fd = fs.openSync(filename, 'r');
      let clock = null, eligible = 0;
      try {
        for (const { index, data } of iterFrames(fd)) {
          decoded++;
          // Always yield, including skipped frames, so input/signals are serviced.
          await sleep(0);
          if (clock === null && index >= options.start) clock = now();
          let pausedAt = null;
          while (true) {
            for (const event of input.events()) if (event.kind === 'key') {
              if (QUIT.has(event.key)) quit = true;
              if (event.key === ' ') paused = !paused;
            }
            if (quit) break;
            if (paused) {
              if (pausedAt === null) pausedAt = now();
              await sleep(15); continue;
            }
            if (pausedAt !== null) { if (clock !== null) clock += now() - pausedAt; pausedAt = null; }
            const target = clock === null ? 0 : clock + (index - options.start) * interval;
            const wait = target - now();
            if (wait <= 0) break;
            await sleep(Math.min(15, wait * 1000));
          }
          if (quit) break;
          if (index < options.start) continue;
          eligible++;
          const target = clock + (index - options.start) * interval;
          if (interval && now() > target + interval) { dropped++; continue; }
          const dim = terminalSize();
          if (fit.cols !== dim.cols || fit.rows !== dim.rows) {
            fit = fitToTerminal(h.width, h.height); await write(ESC.clear);
          }
          const painted = renderFrame(data, h.width, h.height, fit.xmap, fit.ymap, options.gray);
          if (painted === null) { dropped++; continue; }
          shown++;
          await write(painted + status(`frame ${index} shown ${shown} dropped ${dropped} | ${h.width}x${h.height} v${h.version} ${options.fps} fps | q quit, space pause`));
          if (options.maxFrames && shown >= options.maxFrames) { quit = true; break; }
        }
      } finally { fs.closeSync(fd); }
      if (!options.loop || !eligible) break;
    } while (!quit);
  });
  console.log(`played ${shown} frames (${decoded} decoded, ${dropped} dropped to keep pace)`);
  return 0;
}
function loadAsciiGrid(filename, h) {
  const ga = h.reserved >>> 16, gb = h.reserved & 65535;
  if (!ga || !gb) throw new NsigiiError(`header declares a ${ga}x${gb} rotation grid`);
  if (ga * gb * h.expected > MAX_GRID_BYTES) throw new NsigiiError('ASCII grid exceeds 512 MiB memory limit');
  const cells = new Array(ga * gb), fd = fs.openSync(filename, 'r');
  let found = 0;
  try {
    for (const { index, data } of iterFrames(fd)) {
      if (index >= cells.length) break;
      if (data.length !== h.expected) throw new NsigiiError(`ASCII frame ${index} has ${data.length} bytes; expected ${h.expected}`);
      cells[index] = data; found++;
    }
  } finally { fs.closeSync(fd); }
  if (found !== cells.length) throw new NsigiiError(`expected ${cells.length} frames for a ${ga}x${gb} grid, found ${found}`);
  return { ga, gb, cells };
}
async function doPlayAscii(filename, spin, h) {
  const { ga, gb, cells } = loadAsciiGrid(filename, h);
  let A = 0, B = 0, lastPos = null, lastMouseTime = null, lastTime = now();
  let lastIndex = -1, gain = GAIN_MIN, speed = 0, quit = false, dims = '';
  await withTerminal(true, async input => {
    while (!quit) {
      const time = now(), dt = time - lastTime; lastTime = time;
      let moved = false;
      for (const event of input.events()) {
        if (event.kind === 'key') {
          if (QUIT.has(event.key)) quit = true;
          else if (event.key === ' ') spin = !spin;
          else if (/^[rR]$/.test(event.key)) { A = B = 0; lastPos = null; moved = true; }
          else if (['up', 'down', 'left', 'right'].includes(event.key)) {
            if (event.key === 'up') A -= TAU / ga;
            if (event.key === 'down') A += TAU / ga;
            if (event.key === 'left') B -= TAU / gb;
            if (event.key === 'right') B += TAU / gb;
            moved = true;
          }
          continue;
        }
        if (event.button & 64) continue; // Wheel reports are not cursor movement.
        if (lastPos) {
          const dx = event.x - lastPos.x, dy = event.y - lastPos.y;
          if (dx || dy) {
            speed = Math.hypot(dx, dy) / Math.max(0.001, time - lastMouseTime);
            gain = GAIN_MIN + (GAIN_MAX - GAIN_MIN) * Math.min(1, speed / SPEED_REF);
            B += dx * gain * RAD_PER_CELL; A += dy * gain * RAD_PER_CELL; moved = true;
          }
        }
        lastPos = event; lastMouseTime = time;
      }
      if (quit) break;
      if (spin && !moved) { B += IDLE_SPIN * dt; A += IDLE_SPIN * 0.37 * dt; }
      A = mod(A, TAU); B = mod(B, TAU);
      const ai = Math.floor(A / TAU * ga) % ga, bi = Math.floor(B / TAU * gb) % gb;
      const index = ai * gb + bi, { cols, rows } = terminalSize();
      const nextDims = `${cols}x${rows}`;
      if (dims !== nextDims) { await write(ESC.clear); dims = nextDims; lastIndex = -1; }
      if (index !== lastIndex) {
        lastIndex = index;
        await write(renderAscii(cells[index], h.width, h.height, cols, rows) +
          status(`A ${(A * 180 / Math.PI).toFixed(1)} B ${(B * 180 / Math.PI).toFixed(1)} cell ${ai},${bi}/${ga}x${gb} gain ${gain.toFixed(2)} ${speed.toFixed(0)} cells/s | mouse/arrows, space spin, r reset, q quit`));
      }
      await sleep(8);
    }
  });
  return 0;
}
const HELP = `Usage: node nsigii_play.cjs <file.nsigii> [options]
  --fps N          Playback rate (default 30; 0 = unpaced)
  --gray           Render luma only
  --loop           Repeat video until quit
  --info           Header, frame statistics and luma diagnostics
  --sample N       Frames sampled by --info (default 3)
  --max-frames N   Stop after N drawn video frames (0 = unlimited)
  --start N        Skip first N video records (default 0)
  --no-spin        ASCII grid: disable idle rotation
  -h, --help       Show this help
Keys: q/Esc/Ctrl-Z/Ctrl-C quit; space pause or toggle idle spin.
ASCII: mouse or arrows rotate; r resets. Requires an ANSI terminal.
Mouse input depends on terminal support; arrows work as a fallback.
Limits: 256 MiB per frame, 512 MiB ASCII grid. No dependencies.`;
function parseArgs(argv) {
  const options = { fps: 30, gray: false, loop: false, info: false, sample: 3, maxFrames: 0, start: 0, noSpin: false };
  const flags = { '--gray': 'gray', '--loop': 'loop', '--info': 'info', '--no-spin': 'noSpin' };
  const numbers = { '--fps': 'fps', '--sample': 'sample', '--max-frames': 'maxFrames', '--start': 'start' };
  let literal = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!literal && arg === '--') { literal = true; continue; }
    if (!literal && (arg === '--help' || arg === '-h')) { options.help = true; continue; }
    if (!literal && flags[arg]) { options[flags[arg]] = true; continue; }
    const [flag, inline] = arg.split(/=(.*)/s);
    if (!literal && numbers[flag]) {
      const value = inline === undefined ? argv[++i] : inline;
      const n = Number(value);
      if (value === undefined || value.trim() === '' || !Number.isFinite(n) || n < 0 ||
          (flag !== '--fps' && !Number.isSafeInteger(n))) throw new NsigiiError(`invalid value for ${flag}`);
      options[numbers[flag]] = n; continue;
    }
    if (!literal && arg.startsWith('-')) throw new NsigiiError(`unknown option: ${arg}`);
    if (options.file) throw new NsigiiError('only one input file is accepted');
    options.file = arg;
  }
  options.sample = Math.max(1, options.sample);
  if (!options.file && !options.help) throw new NsigiiError('an input file is required (use --help)');
  return options;
}
async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); }
  catch (err) { console.error(`nsigii: ${err.message}`); return 2; }
  if (options.help) { console.log(HELP); return 0; }
  try {
    if (!fs.statSync(options.file).isFile()) throw Object.assign(new Error('not a regular file'), { code: 'ENOENT' });
    const h = probe(options.file);
    if (options.info) return doInfo(options.file, options.sample);
    return h.kind === 'ascii' ? await doPlayAscii(options.file, !options.noSpin, h) : await doPlay(options.file, options, h);
  } catch (err) {
    if (err.code === 'EPIPE') return 0;
    console.error(`nsigii: ${err.message}`);
    return err.code === 'ENOENT' ? 2 : 1;
  }
}
module.exports = { NsigiiError, readHeader, probe, iterFrames, payloadKind, renderFrame,
  renderAscii, nnMap, InputStream, loadAsciiGrid, parseArgs, main };
if (require.main === module) {
  process.stdout.on('error', err => { outputError = err; });
  main().then(code => { process.exitCode = code; }, err => {
    if (err.code !== 'EPIPE') console.error(`nsigii: ${err.message}`);
    process.exitCode = err.code === 'EPIPE' ? 0 : 1;
  });
}
