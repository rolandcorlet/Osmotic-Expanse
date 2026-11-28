// Which AI the Director (and the converter) uses. Kept in saves/director.json on the host computer.
// Keys never reach a screen: the screens get publicView(), which only says whether a key is set.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, providerInfo, PROVIDERS } from './providers.js';

export function createSettings({ saveDir }) {
  const file = join(saveDir, 'director.json');
  let cfg = { provider: 'gemini', model: '', baseUrl: '', keys: {}, thinking: 'default', numCtx: 16384 };
  try { if (existsSync(file)) cfg = { ...cfg, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch (e) { /* defaults */ }
  // A key in the environment (GEMINI_API_KEY and the like) is used when none was saved.
  const keyFor = (id) => cfg.keys[id] || process.env[providerInfo(id).env || ''] || '';
  const save = () => { try { mkdirSync(saveDir, { recursive: true }); writeFileSync(file, JSON.stringify(cfg, null, 1)); } catch (e) { /* stays in memory */ } };
  return {
    publicView() {
      return { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, thinking: cfg.thinking, keySet: !!keyFor(cfg.provider), keysSet: Object.fromEntries(PROVIDERS.map((p) => [p.id, !!keyFor(p.id)])) };
    },
    configure(b) {
      if (b.provider && PROVIDERS.some((p) => p.id === b.provider)) { if (b.provider !== cfg.provider) cfg.model = ''; cfg.provider = b.provider; }
      if (typeof b.model === 'string') cfg.model = b.model.trim().slice(0, 200);
      if (typeof b.baseUrl === 'string') cfg.baseUrl = b.baseUrl.trim().slice(0, 300);
      if (typeof b.apiKey === 'string' && b.apiKey.trim()) cfg.keys[cfg.provider] = b.apiKey.trim();
      if (b.clearKey) delete cfg.keys[cfg.provider];
      if (['default', 'off', 'low', 'medium'].includes(b.thinking)) cfg.thinking = b.thinking;
      save();
    },
    provider() { return build({ provider: cfg.provider, apiKey: keyFor(cfg.provider), baseUrl: cfg.baseUrl, model: cfg.model, numCtx: cfg.numCtx, thinking: cfg.thinking }); },
    // For listing models before one is chosen.
    lister() { return build({ provider: cfg.provider, apiKey: keyFor(cfg.provider), baseUrl: cfg.baseUrl, model: cfg.model || 'none', numCtx: cfg.numCtx }); },
  };
}
