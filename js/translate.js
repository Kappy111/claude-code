// On-device translation.
// 1) Chrome built-in Translator API (on-device, private) when available.
// 2) transformers.js Helsinki-NLP opus-mt model fallback (downloaded + cached).
// Both keep text on the device.

const OPUS = {
  es: 'Xenova/opus-mt-en-es',
  fr: 'Xenova/opus-mt-en-fr',
  de: 'Xenova/opus-mt-en-de',
  it: 'Xenova/opus-mt-en-it',
  pt: 'Xenova/opus-mt-tc-big-en-pt',
  zh: 'Xenova/opus-mt-en-zh',
  ar: 'Xenova/opus-mt-en-ar',
  hi: 'Xenova/opus-mt-en-hi',
  ja: 'Xenova/opus-mt-en-jap',
};

export const LANG_NAMES = {
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
  zh: 'Chinese', ja: 'Japanese', hi: 'Hindi', ar: 'Arabic', en: 'English',
};

function withTimeout(promise, ms, label = 'op') {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms)),
  ]);
}

async function builtinTranslate(text, source, target, onStatus) {
  if (typeof self === 'undefined' || !('Translator' in self)) return null;
  try {
    const avail = await withTimeout(
      self.Translator.availability?.({ sourceLanguage: source, targetLanguage: target }),
      2500, 'avail'
    );
    if (!avail || avail === 'unavailable') return null;
    onStatus?.('Preparing on-device translator…');
    const translator = await withTimeout(self.Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => onStatus?.(`Downloading language pack… ${Math.round((e.loaded || 0) * 100)}%`));
      },
    }), 120000, 'create');
    const out = await withTimeout(translator.translate(text), 60000, 'translate');
    translator.destroy?.();
    return (out || '').trim() || null;
  } catch (_) {
    return null; // fall through to the opus-mt model path
  }
}

let opusCache = {};
async function opusTranslate(text, target, onStatus) {
  const model = OPUS[target];
  if (!model) throw new Error(`No on-device model available for ${LANG_NAMES[target] || target}.`);
  onStatus?.('Loading translation model…');
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  if (!opusCache[model]) {
    opusCache[model] = await pipeline('translation', model, {
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) onStatus?.(`Downloading model… ${Math.round((p.loaded / p.total) * 100)}%`);
      },
    });
  }
  const translator = opusCache[model];
  onStatus?.('Translating locally…');
  // Translate paragraph-by-paragraph to respect model max length.
  const parts = text.split(/\n+/).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const res = await translator(part, { max_new_tokens: 512 });
    out.push(Array.isArray(res) ? res[0].translation_text : res.translation_text);
  }
  return out.join('\n');
}

// Returns { text, engine }.
export async function translate(text, target, { source = 'en', onStatus } = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Nothing to translate yet.');
  if (target === source) return { text: trimmed, engine: 'no-op (same language)' };

  const builtin = await builtinTranslate(trimmed, source, target, onStatus);
  if (builtin) return { text: builtin, engine: 'Chrome on-device translator' };

  const out = await opusTranslate(trimmed, target, onStatus);
  return { text: out, engine: 'opus-mt (on-device)' };
}
