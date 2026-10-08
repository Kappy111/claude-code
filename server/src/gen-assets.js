// Generates self-contained demo media (videos, posters, photos) into the uploads dir
// using ffmpeg, so OmniFeed works fully offline with no external media hosts.
// Run automatically by the seed script.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.js';

const SEED_DIR = path.join(UPLOAD_DIR, 'seed');
fs.mkdirSync(SEED_DIR, { recursive: true });

const PALETTES = [
  ['#7c5cff', '#ff5c8a'], ['#2fd4c4', '#7c5cff'], ['#ffb15c', '#ff5c8a'],
  ['#5a34d6', '#2fd4c4'], ['#ff5c8a', '#ffb15c'], ['#9375ff', '#2fd4c4'],
  ['#13131d', '#7c5cff'], ['#ff5c8a', '#5a34d6'],
];

function hasFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// ---- SVG gradient poster/photo (no ffmpeg needed) ----
export function svgImage(label, idx, w = 1280, h = 720) {
  const [a, b] = PALETTES[idx % PALETTES.length];
  const name = `img-${idx}-${w}x${h}.svg`;
  const file = path.join(SEED_DIR, name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="r" cx="0.8" cy="0.2" r="0.9">
      <stop offset="0" stop-color="rgba(255,255,255,0.25)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#r)"/>
  <circle cx="${w * 0.18}" cy="${h * 0.8}" r="${h * 0.28}" fill="rgba(0,0,0,0.12)"/>
  <text x="${w / 2}" y="${h / 2}" font-family="Inter,sans-serif" font-size="${Math.round(h * 0.09)}"
    font-weight="800" fill="rgba(255,255,255,0.92)" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;
  fs.writeFileSync(file, svg);
  return `/media/seed/${name}`;
}

// ---- Avatar as SVG (deterministic gradient + initials) ----
export function svgAvatar(initials, idx) {
  const [a, b] = PALETTES[idx % PALETTES.length];
  const name = `avatar-${idx}.svg`;
  const file = path.join(SEED_DIR, name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="200" height="200" fill="url(#g)"/>
  <text x="100" y="108" font-family="Inter,sans-serif" font-size="88" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">${initials}</text>
</svg>`;
  fs.writeFileSync(file, svg);
  return `/media/seed/${name}`;
}

// ---- Video via ffmpeg (animated gradient + title + timer + tone) ----
// ffmpeg is used only to make playable demo videos for local dev. In production
// we skip it (OMNIFEED_SEED_MEDIA=svg or no ffmpeg installed) so boot is instant;
// real user-uploaded videos play natively and never need transcoding.
const ffmpeg = hasFfmpeg() && process.env.OMNIFEED_SEED_MEDIA !== 'svg';
export function makeVideo(label, idx, { vertical = false, seconds = 12 } = {}) {
  const w = vertical ? 720 : 1280;
  const h = vertical ? 1280 : 720;
  const name = `vid-${idx}-${vertical ? 'v' : 'h'}.mp4`;
  const file = path.join(SEED_DIR, name);
  if (fs.existsSync(file)) return { url: `/media/seed/${name}`, duration: seconds };
  if (!ffmpeg) return { url: svgImage(label, idx, w, h), duration: 0 };

  const [a] = PALETTES[idx % PALETTES.length];
  const safe = label.replace(/[:'\\%]/g, ' ').slice(0, 40);
  try {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `color=c=${a}:s=${w}x${h}:d=${seconds}:r=24`,
      '-f', 'lavfi', '-i', `sine=frequency=320:duration=${seconds}`,
      '-vf', [
        `drawtext=text='${safe}':fontcolor=white:fontsize=${vertical ? 44 : 52}:x=(w-text_w)/2:y=h/2-120:box=1:boxcolor=black@0.25:boxborderw=20`,
        `drawtext=text='OmniFeed':fontcolor=white@0.85:fontsize=${vertical ? 34 : 40}:x=(w-text_w)/2:y=h/2+10`,
        `drawtext=text='%{eif\\:t\\:d}s':fontcolor=white@0.9:fontsize=36:x=(w-text_w)/2:y=h-90`,
      ].join(','),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
      '-c:a', 'aac', '-shortest', '-movflags', '+faststart', file,
    ], { stdio: 'ignore' });
    return { url: `/media/seed/${name}`, duration: seconds };
  } catch (e) {
    return { url: svgImage(label, idx, w, h), duration: 0 };
  }
}

export const FFMPEG_AVAILABLE = ffmpeg;
