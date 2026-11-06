#!/usr/bin/env node
/**
 * Encode authored takes into public/sfx.
 *
 * Drop raw files in a folder as `<name>.wav` or `<name>.mp3` (`reel-stop.1`,
 * `reel-stop.2`, ... for variants) and run:
 *
 *   node scripts/encode-sfx.mjs <folder>        # needs ffmpeg on PATH
 *
 * Each take is cut to its first transient (the head is dropped up to the
 * first sample above -30 dB, so a thud lands on the frame it is asked for
 * instead of after a swell), trimmed of its tail below -50 dB, peak-normalized
 * to -1 dBFS, and written as WebM (Opus) + M4A (AAC), the
 * codec pair zvuk's source ladder expects. A name ending in `.loop` keeps its
 * head and tail (a seamless loop must not be trimmed) and loses the suffix.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/sfx/', import.meta.url));
const dir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('usage: node scripts/encode-sfx.mjs <folder of wav/mp3 takes>');
  process.exit(1);
}

// Normalize first so the -30 dB onset gate is relative to the take's peak,
// then cut the head to the transient with a 3 ms fade so the cut never clicks.
const TRIM = 'silenceremove=start_periods=1:start_threshold=-30dB:start_silence=0,'
  + 'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,'
  + 'afade=t=in:d=0.003';

/** The gain, in dB, that puts the take's peak at -1 dBFS (volumedetect reports on stderr). */
function peakGain(src) {
  const run = spawnSync('ffmpeg', ['-i', src, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(run.stderr);
  if (!m) throw new Error(`volumedetect found no peak in ${src}`);
  return -1 - Number(m[1]);
}

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(dir).filter((f) => /\.(wav|mp3|m4a|flac)$/i.test(f)).sort()) {
  const stem = basename(file, extname(file));
  const loop = stem.endsWith('.loop');
  const name = loop ? stem.slice(0, -5) : stem;
  const src = join(dir, file);
  const filters = [`volume=${peakGain(src).toFixed(2)}dB`].concat(loop ? [] : [TRIM]).join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', filters, '-ac', '1', '-c:a', 'libopus', '-b:a', '64k', join(OUT, `${name}.webm`)]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', filters, '-ac', '1', '-c:a', 'aac', '-b:a', '96k', join(OUT, `${name}.m4a`)]);
  console.log(`${name}${loop ? ' (loop)' : ''}: webm + m4a`);
}
