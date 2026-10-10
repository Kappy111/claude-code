// On-device speaker diarization (approximate).
// Extracts per-segment acoustic features (pitch + energy) from the decoded
// 16kHz PCM and clusters transcript segments into N speakers with k-means.
// Pure JS, no model download, so it never throws "Speaker detection failed".
import { WHISPER_SR } from './media.js';

// Estimate fundamental frequency (pitch) of a frame via autocorrelation.
function estimatePitch(frame, sr) {
  const n = frame.length;
  // Remove DC
  let mean = 0;
  for (let i = 0; i < n; i++) mean += frame[i];
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) { const v = frame[i] - mean; frame[i] = v; energy += v * v; }
  if (energy < 1e-4) return { pitch: 0, energy: 0 };

  const minLag = Math.floor(sr / 350); // 350 Hz max
  const maxLag = Math.floor(sr / 70);  // 70 Hz min
  let bestLag = -1, bestCorr = 0;
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < n; i++) corr += frame[i] * frame[i + lag];
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  const pitch = bestLag > 0 ? sr / bestLag : 0;
  return { pitch, energy: Math.sqrt(energy / n) };
}

// Feature vector for a time slice of PCM: [medianPitch, meanEnergy].
function segmentFeatures(pcm, startSec, endSec, sr) {
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(pcm.length, Math.floor((endSec ?? (startSec + 2)) * sr));
  if (end - start < sr * 0.1) return null;

  const frameLen = Math.floor(sr * 0.04); // 40ms
  const hop = Math.floor(sr * 0.02);       // 20ms
  const pitches = [];
  let energySum = 0, frames = 0;
  for (let p = start; p + frameLen < end; p += hop) {
    const frame = pcm.slice(p, p + frameLen);
    const { pitch, energy } = estimatePitch(frame, sr);
    energySum += energy; frames++;
    if (pitch > 0) pitches.push(pitch);
  }
  if (!frames) return null;
  pitches.sort((a, b) => a - b);
  const medPitch = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 0;
  return [medPitch, energySum / frames];
}

function normalize(features) {
  const dims = features[0].length;
  const mean = new Array(dims).fill(0);
  const std = new Array(dims).fill(0);
  for (const f of features) for (let d = 0; d < dims; d++) mean[d] += f[d];
  for (let d = 0; d < dims; d++) mean[d] /= features.length;
  for (const f of features) for (let d = 0; d < dims; d++) std[d] += (f[d] - mean[d]) ** 2;
  for (let d = 0; d < dims; d++) std[d] = Math.sqrt(std[d] / features.length) || 1;
  return features.map(f => f.map((v, d) => (v - mean[d]) / std[d]));
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

function meanOf(members, dims) {
  const m = new Array(dims).fill(0);
  for (const x of members) for (let d = 0; d < dims; d++) m[d] += x[d];
  for (let d = 0; d < dims; d++) m[d] /= members.length;
  return m;
}

// A single k-means run with k-means++ init. Returns { assign, inertia }.
function kmeansOnce(points, k, iters = 50) {
  const dims = points[0].length;
  // k-means++ init with correct weighted sampling.
  const centroids = [points[Math.floor(Math.random() * points.length)].slice()];
  while (centroids.length < k) {
    const d2 = points.map(p => Math.min(...centroids.map(c => dist(p, c))));
    const sum = d2.reduce((a, b) => a + b, 0);
    let chosen;
    if (sum <= 0) {
      chosen = Math.floor(Math.random() * points.length);
    } else {
      let r = Math.random() * sum;
      chosen = 0;
      for (let i = 0; i < d2.length; i++) { r -= d2[i]; if (r <= 0) { chosen = i; break; } }
    }
    centroids.push(points[chosen].slice());
  }

  const assign = new Array(points.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist(points[i], centroids[c]); if (d < bd) { bd = d; best = c; } }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => assign[i] === c);
      if (members.length) { centroids[c] = meanOf(members, dims); continue; }
      // Empty cluster: reseed to the point farthest from its current centroid.
      let far = 0, fd = -1;
      for (let i = 0; i < points.length; i++) {
        const d = dist(points[i], centroids[assign[i]]);
        if (d > fd) { fd = d; far = i; }
      }
      centroids[c] = points[far].slice();
      changed = true;
    }
    if (!changed) break;
  }

  let inertia = 0;
  for (let i = 0; i < points.length; i++) inertia += dist(points[i], centroids[assign[i]]);
  return { assign, inertia };
}

// Multiple restarts; keep the lowest-inertia clustering (avoids unlucky-init collapse).
function kmeans(points, k, restarts = 12) {
  if (points.length <= k) return points.map((_, i) => i % k);
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const run = kmeansOnce(points, k);
    if (!best || run.inertia < best.inertia) best = run;
  }
  return best.assign;
}

// chunks: [{start,end,text}], pcm: Float32Array @16k, speakers: desired count.
// Returns array of speaker labels (0-based) aligned to chunks.
export function diarize(chunks, pcm, speakers = 2) {
  if (!chunks.length) return [];
  const feats = [];
  const idxMap = [];
  for (let i = 0; i < chunks.length; i++) {
    const f = segmentFeatures(pcm, chunks[i].start, chunks[i].end, WHISPER_SR);
    if (f) { feats.push(f); idxMap.push(i); }
  }
  if (feats.length === 0) return chunks.map(() => 0);

  const k = Math.max(1, Math.min(speakers, feats.length));
  const assign = k === 1 ? feats.map(() => 0) : kmeans(normalize(feats), k);

  // Map raw assignments back; fill gaps by nearest previous.
  const labels = new Array(chunks.length).fill(-1);
  for (let j = 0; j < idxMap.length; j++) labels[idxMap[j]] = assign[j];
  let last = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === -1) labels[i] = last; else last = labels[i];
  }

  // Relabel so speakers are numbered by first appearance.
  const order = new Map();
  let next = 0;
  return labels.map(l => {
    if (!order.has(l)) order.set(l, next++);
    return order.get(l);
  });
}

export const SPEAKER_COLORS = [
  '#60a5fa', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#22d3ee',
];
