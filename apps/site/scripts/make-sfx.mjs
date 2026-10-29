#!/usr/bin/env node
/**
 * Synthesize the recipe sound effects into public/sfx.
 *
 * Every sound is sine waves, filtered noise and envelopes, so there is no
 * sample library and no licence to track. The WAVs are written to a scratch
 * folder and ffmpeg encodes each to WebM (Opus) + M4A (AAC), the codec pair
 * zvuk's source ladder expects. Only the encoded files are committed.
 *
 *   node scripts/make-sfx.mjs           # needs ffmpeg on PATH
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT = fileURLToPath(new URL('../public/sfx/', import.meta.url));

// A fixed-seed PRNG so the files are the same on every run.
let seed = 7;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
}

const samples = (seconds) => Math.round(RATE * seconds);
const expDecay = (n, tau) => Float64Array.from({ length: n }, (_, i) => Math.exp(-i / (RATE * tau)));

/** A tone whose frequency may glide: `freq(t)` in Hz, `t` in seconds. */
function tone(seconds, freq, { tau = 0.3, shape = 'sine' } = {}) {
  const n = samples(seconds);
  const out = new Float64Array(n);
  const env = expDecay(n, tau);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = typeof freq === 'function' ? freq(i / RATE) : freq;
    phase += (2 * Math.PI * f) / RATE;
    const w = shape === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
    out[i] = w * env[i];
  }
  return out;
}

/** White noise through a one-pole low-pass, with its own decay. */
function noise(seconds, { cutoff = 2000, tau = 0.05 } = {}) {
  const n = samples(seconds);
  const out = new Float64Array(n);
  const env = expDecay(n, tau);
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += a * (rand() * 2 - y);
    out[i] = y * env[i];
  }
  return out;
}

function mix(...parts) {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float64Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

function gain(x, g) {
  return x.map((v) => v * g);
}

/** Start `part` at `at` seconds inside a buffer of `total` seconds. */
function place(total, ...items) {
  const out = new Float64Array(samples(total));
  for (const [at, part] of items) {
    const o = samples(at);
    for (let i = 0; i < part.length && o + i < out.length; i++) out[o + i] += part[i];
  }
  return out;
}

/** Cross-fade the tail into the head so a loop has no seam. */
function seamless(x, fade = 0.05) {
  const f = samples(fade);
  const n = x.length - f;
  const out = x.slice(0, n);
  for (let i = 0; i < f; i++) {
    const t = i / f;
    out[i] = out[i] * t + x[n + i] * (1 - t);
  }
  return out;
}

/** Peak-normalize to `peakDb` and fade both ends by `fade` seconds. */
function finish(x, { peakDb = -1, fade = 0.005 } = {}) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 1;
  const out = x.map((v) => v * g);
  const f = Math.min(samples(fade), out.length >> 1);
  for (let i = 0; i < f; i++) {
    out[i] *= i / f;
    out[out.length - 1 - i] *= i / f;
  }
  return out;
}

// --- the sounds --------------------------------------------------------------

/**
 * The reels launching: one soft whoosh, over in a third of a second. No bed
 * under the spin: a loop that runs for every spin of a demo wears thin fast,
 * and the reel stops carry the rhythm on their own.
 */
function spin() {
  const n = samples(0.36);
  const out = new Float64Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const cutoff = 250 + 1400 * Math.sin((Math.PI * t) / 0.36);
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
    y += a * (rand() * 2 - y);
    const env = Math.sin((Math.PI * t) / 0.36) ** 1.6;
    out[i] = y * env;
  }
  return finish(out, { peakDb: -9 });
}

/** A reel landing: a short pitch drop with a knock on top. */
function reelStop(top, bottom) {
  const body = tone(0.16, (t) => bottom + (top - bottom) * Math.exp(-t / 0.03), { tau: 0.07 });
  const knock = gain(noise(0.03, { cutoff: 2400, tau: 0.01 }), 0.5);
  return finish(mix(body, knock));
}

/** The tease: a minor dyad with a slow tremolo, looping. */
function anticipation() {
  const n = samples(1.2);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const trem = 0.65 + 0.35 * Math.sin(2 * Math.PI * 5 * t);
    out[i] = (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 261.6 * t) + 0.3 * Math.sin(2 * Math.PI * 440 * t)) * trem;
  }
  const shimmer = new Float64Array(n);
  const a = 1 - Math.exp((-2 * Math.PI * 4000) / RATE);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += a * (rand() * 2 - y);
    shimmer[i] = (y - (shimmer[i - 1] ?? 0) * 0.5) * 0.08;
  }
  return finish(seamless(mix(out, shimmer), 0.1), { peakDb: -8, fade: 0 });
}

/** A skip press: a dry click. */
function skip() {
  return finish(mix(gain(noise(0.012, { cutoff: 6000, tau: 0.003 }), 0.8), tone(0.05, 1800, { tau: 0.012 })));
}

/** A win: three bells up a major chord. */
function win() {
  const bell = (f) => mix(tone(0.5, f, { tau: 0.28 }), gain(tone(0.5, f * 2.76, { tau: 0.09 }), 0.3));
  return finish(place(0.75, [0, bell(1046.5)], [0.11, bell(1318.5)], [0.22, bell(1568)]));
}

/** A cascade destroying its winners: a soft pop. */
function pop() {
  return finish(mix(tone(0.09, (t) => 180 + 520 * Math.exp(-t / 0.012), { tau: 0.04 }), gain(noise(0.03, { cutoff: 1800, tau: 0.012 }), 0.4)));
}

const SOUNDS = {
  spin,
  'reel-stop.1': () => reelStop(150, 70),
  'reel-stop.2': () => reelStop(165, 78),
  'reel-stop.3': () => reelStop(138, 64),
  anticipation,
  skip,
  win,
  pop,
};

// --- writing -----------------------------------------------------------------

function wav(x) {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const scratch = mkdtempSync(join(tmpdir(), 'pixi-reels-sfx-'));
mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const src = join(scratch, `${name}.wav`);
  writeFileSync(src, wav(make()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'libopus', '-b:a', '64k', join(OUT, `${name}.webm`)]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'aac', '-b:a', '96k', join(OUT, `${name}.m4a`)]);
  console.log(`${name}: webm + m4a`);
}
