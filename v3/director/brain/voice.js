// The Director's voice, and the talk button's ears. Settings live in saves/voice.json on the host
// computer; keys never reach a screen.
//
// Voice out (speech): 'browser' lets each screen speak with its own built-in voice: free, instant,
// no set-up. 'server' sends each sentence to an OpenAI-compatible /v1/audio/speech server: Kokoro
// or Piper on this PC (no key), or a cloud service with a key. Screens fetch one sentence at a time,
// so the first words play while the rest are still being made.
//
// Voice in (the talk button): 'browser' uses the phone's own speech recognition (Google on Android
// and Chrome, Apple on iPhone). 'server' records on the phone and sends the clip here, and the host
// passes it to an OpenAI-compatible /v1/audio/transcriptions server: Whisper on this PC, or cloud.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DEFAULTS = {
  out: { engine: 'browser', url: '', key: '', model: 'kokoro', voice: 'af_heart', speed: 1 },
  in: { engine: 'browser', url: '', key: '', model: 'Systran/faster-whisper-small', language: 'en' },
};
const MAX_SAY = 600;       // characters in one sentence request
const MAX_CLIP = 4 << 20;  // bytes of audio from the talk button
const CACHE = 80;          // sentences kept, so several screens speaking the same line pay once

export function createVoice({ saveDir, fetchImpl = fetch, getState }) {
  const file = join(saveDir, 'voice.json');
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    if (existsSync(file)) {
      const old = JSON.parse(readFileSync(file, 'utf8'));
      for (const side of ['out', 'in']) Object.assign(cfg[side], old[side] || {});
    }
  } catch (e) { /* defaults */ }
  const save = () => { try { mkdirSync(saveDir, { recursive: true }); writeFileSync(file, JSON.stringify(cfg, null, 1)); } catch (e) { /* stays in memory */ } };
  const cache = new Map();
  const base = (u) => String(u || '').replace(/\/+$/, '');
  const auth = (k) => (k ? { authorization: `Bearer ${k}` } : {});

  // Only what the Director actually narrated may be spoken: a screen cannot make the speech
  // server say anything else (and on a cloud key, cannot spend money on anything else).
  function narrated(text) {
    const s = getState();
    const flat = (x) => String(x || '').replace(/\s+/g, ' ').trim();
    const t = flat(text);
    if (!t) return false;
    return (s.story || []).slice(-40).some((e) => e.kind === 'narration' && flat(e.text).includes(t));
  }

  return {
    // What every screen may know: which engines, and where speech is turned into text (for consent).
    publicView() {
      return {
        out: cfg.out.engine,
        in: cfg.in.engine,
        hearWhere: cfg.in.engine === 'server'
          ? (/localhost|127\.0\.0\.1|^http:\/\/(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(cfg.in.url) ? 'the host\'s own computer' : `a speech service at ${(cfg.in.url.match(/^https?:\/\/([^/]+)/) || [])[1] || 'the address the host set'}`)
          : 'your phone\'s own speech service (Google on Android, Apple on iPhone)',
      };
    },

    hostView() {
      const hide = (x) => ({ ...x, key: undefined, keySet: !!x.key });
      return { out: hide(cfg.out), in: hide(cfg.in) };
    },

    configure(body) {
      for (const side of ['out', 'in']) {
        const b = body[side];
        if (!b || typeof b !== 'object') continue;
        if (['browser', 'server'].includes(b.engine)) cfg[side].engine = b.engine;
        for (const k of ['url', 'model', 'voice', 'language']) if (typeof b[k] === 'string' && k in cfg[side]) cfg[side][k] = b[k].trim().slice(0, 200);
        if (typeof b.key === 'string' && b.key.trim()) cfg[side].key = b.key.trim();
        if (b.clearKey) cfg[side].key = '';
        if (b.speed != null && side === 'out') cfg.out.speed = Math.min(1.6, Math.max(0.6, Number(b.speed) || 1));
      }
      cache.clear();
      save();
    },

    // One sentence of narration, as audio. Returns { ok, type, bytes } or { ok:false, error }.
    async say(text) {
      if (cfg.out.engine !== 'server') return { ok: false, error: 'The Director speaks with each screen\'s own voice.' };
      const t = String(text || '').trim().slice(0, MAX_SAY);
      if (!narrated(t)) return { ok: false, error: 'Only the Director\'s narration is spoken.' };
      const id = createHash('sha1').update(`${cfg.out.model}|${cfg.out.voice}|${cfg.out.speed}|${t}`).digest('hex');
      if (cache.has(id)) return cache.get(id);
      const job = (async () => {
        const r = await fetchImpl(`${base(cfg.out.url)}/audio/speech`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth(cfg.out.key) },
          body: JSON.stringify({ model: cfg.out.model, voice: cfg.out.voice, input: t, response_format: 'mp3', speed: cfg.out.speed }),
        });
        if (!r.ok) return { ok: false, error: `The speech server said ${r.status}.` };
        return { ok: true, type: r.headers.get('content-type') || 'audio/mpeg', bytes: Buffer.from(await r.arrayBuffer()) };
      })().catch((e) => ({ ok: false, error: `The speech server could not be reached: ${e.message}` }));
      cache.set(id, job);
      if (cache.size > CACHE) cache.delete(cache.keys().next().value);
      const out = await job;
      if (!out.ok) cache.delete(id); // try again next time
      return out;
    },

    // A clip from the talk button, as text.
    async hear(bytes, type = 'audio/webm') {
      if (cfg.in.engine !== 'server') return { ok: false, error: 'The talk button uses the phone\'s own speech recognition.' };
      if (!bytes || !bytes.length) return { ok: false, error: 'Nothing was recorded.' };
      if (bytes.length > MAX_CLIP) return { ok: false, error: 'That was too long. Keep it under about a minute.' };
      const ext = /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : /wav/.test(type) ? 'wav' : 'webm';
      const form = new FormData();
      form.append('file', new Blob([bytes], { type }), `talk.${ext}`);
      form.append('model', cfg.in.model);
      if (cfg.in.language) form.append('language', cfg.in.language);
      try {
        const r = await fetchImpl(`${base(cfg.in.url)}/audio/transcriptions`, { method: 'POST', headers: auth(cfg.in.key), body: form });
        if (!r.ok) return { ok: false, error: `The speech server said ${r.status}.` };
        const j = await r.json().catch(() => ({}));
        return { ok: true, text: String(j.text || '').trim() };
      } catch (e) {
        return { ok: false, error: `The speech server could not be reached: ${e.message}` };
      }
    },

    limits: { MAX_CLIP, MAX_SAY },
  };
}

// Narration in sentences, small enough that the first one comes back quickly.
export function sentences(text) {
  const parts = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g) || [];
  const out = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    // Very short sentences ride along with the next, so the voice does not stutter.
    if (out.length && out[out.length - 1].length < 40) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}
