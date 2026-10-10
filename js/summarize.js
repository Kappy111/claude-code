// On-device summarization.
// 1) Chrome built-in Summarizer API (on-device) when available.
// 2) Deterministic extractive summarizer (TextRank-ish) as a reliable fallback.
// Never uploads text; never throws "Summarization failed".

const STOPWORDS = new Set(('a an the and or but if then else of to in on at by for with from as is are was were be been being this that these those it its i you he she we they them his her their our your my me us do does did done have has had not no so than too very can will just about into over under out up down also more most some such only own same few other each any all what which who whom why how when where').split(' '));

function splitSentences(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  // Split on sentence enders while keeping reasonable chunks.
  const parts = clean.match(/[^.!?]+[.!?]+|\S+$/g) || [clean];
  return parts.map(s => s.trim()).filter(s => s.length > 2);
}

function tokenize(s) {
  return s.toLowerCase().match(/[a-z0-9']+/g) || [];
}

// Extractive summary: score sentences by normalized word frequency, keep top N in order.
export function extractiveSummary(text, maxSentences = 5) {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences.join(' ');

  const freq = Object.create(null);
  for (const s of sentences) {
    for (const w of tokenize(s)) {
      if (STOPWORDS.has(w) || w.length < 3) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  let maxF = 1;
  for (const k in freq) if (freq[k] > maxF) maxF = freq[k];

  const scored = sentences.map((s, idx) => {
    const words = tokenize(s).filter(w => !STOPWORDS.has(w) && w.length >= 3);
    if (!words.length) return { idx, score: 0 };
    let score = 0;
    for (const w of words) score += (freq[w] || 0) / maxF;
    score = score / Math.sqrt(words.length); // length-normalize
    // Slight boost for early sentences (intros carry topic).
    if (idx < 2) score *= 1.15;
    return { idx, score };
  });

  const keep = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx)
    .map(x => sentences[x.idx]);
  return keep.join(' ');
}

// Key points as bullets (top distinct sentences).
export function keyPoints(text, n = 5) {
  const summary = extractiveSummary(text, n);
  return splitSentences(summary);
}

function withTimeout(promise, ms, label = 'op') {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms)),
  ]);
}

async function builtinSummarize(text) {
  if (typeof self === 'undefined' || !('Summarizer' in self)) return null;
  try {
    // Only use the built-in model if it is ready NOW — never block on a download.
    const avail = await withTimeout(self.Summarizer.availability?.(), 2500, 'avail');
    if (avail !== 'available') return null;
    const summarizer = await withTimeout(
      self.Summarizer.create({ type: 'tldr', format: 'plain-text', length: 'medium' }),
      5000, 'create'
    );
    const out = await withTimeout(summarizer.summarize(text), 20000, 'summarize');
    summarizer.destroy?.();
    return (out || '').trim() || null;
  } catch (_) {
    return null; // fall through to the always-available extractive summarizer
  }
}

// Returns { summary, points, engine }.
export async function summarize(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Nothing to summarize yet.');

  const builtin = await builtinSummarize(trimmed);
  if (builtin) {
    return { summary: builtin, points: keyPoints(trimmed, 5), engine: 'Chrome on-device AI' };
  }
  const summary = extractiveSummary(trimmed, 5);
  return { summary, points: keyPoints(trimmed, 6), engine: 'extractive (offline)' };
}
