#!/usr/bin/env node
/**
 * Synthesize the reel sounds into public/sfx: the start kick and the three
 * stop thuds. Sine waves, filtered noise and envelopes, so there is no sample
 * library and no licence to track, and every one hits on its first sample.
 * The WAVs are written to a scratch folder and ffmpeg encodes each to WebM
 * (Opus) + M4A (AAC), the codec pair zvuk's source ladder expects. Only the
 * encoded files are committed.
 *
 * The other four (win, pop, skip, the anticipation bed) are authored takes
 * encoded by scripts/encode-sfx.mjs.
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



/** Peak-normalize to `peakDb` and fade both ends by `fade` seconds. */
function finish(x, { peakDb = -1, fade = 0.002 } = {}) {
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

/** The reels launching: a kick with a click on its face, over in 150 ms. */
function spin() {
  const kick = tone(0.16, (t) => 90 + 260 * Math.exp(-t / 0.028), { tau: 0.06 });
  const click = gain(noise(0.012, { cutoff: 5000, tau: 0.003 }), 0.6);
  return finish(mix(kick, click));
}

/** A reel landing: one dry thud, a short pitch drop with a knock on top. */
function thud(top, bottom) {
  const body = tone(0.14, (t) => bottom + (top - bottom) * Math.exp(-t / 0.025), { tau: 0.055 });
  const knock = gain(noise(0.02, { cutoff: 2600, tau: 0.007 }), 0.45);
  return finish(mix(body, knock));
}

const SOUNDS = {
  spin,
  'reel-stop.1': () => thud(150, 70),
  'reel-stop.2': () => thud(165, 78),
  'reel-stop.3': () => thud(138, 64),
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
