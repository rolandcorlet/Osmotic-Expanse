import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVoice, sentences } from '../brain/voice.js';

const story = [{ kind: 'narration', text: 'The vent  hisses.\nSomething stirs below.' }];
const mk = (fetchImpl) => createVoice({ saveDir: mkdtempSync(join(tmpdir(), 'v-')), fetchImpl, getState: () => ({ story }) });

test('browser engine refuses server speech', async () => {
  const v = mk();
  assert.equal((await v.say('The vent hisses.')).ok, false);
});

test('only narration is spoken, spacing ignored, and results cached', async () => {
  let calls = 0;
  const v = mk(async () => { calls++; return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }; });
  v.configure({ out: { engine: 'server', url: 'http://localhost:8880/v1' } });
  assert.equal((await v.say('Buy my product')).ok, false);
  assert.equal(calls, 0);
  assert.equal((await v.say('The vent hisses.')).ok, true);
  assert.equal((await v.say('The vent hisses.')).ok, true);
  assert.equal(calls, 1);
});

test('keys stay hidden and consent text names where speech goes', () => {
  const v = mk();
  v.configure({ in: { engine: 'server', url: 'https://api.example.com/v1', key: 'sk-secret' } });
  assert.equal(JSON.stringify(v.hostView()).includes('sk-secret'), false);
  assert.equal(JSON.stringify(v.publicView()).includes('sk-secret'), false);
  assert.match(v.publicView().hearWhere, /api\.example\.com/);
  v.configure({ in: { url: 'http://192.168.1.5:8000/v1' } });
  assert.match(v.publicView().hearWhere, /host's own computer/);
});

test('sentences split and merge short ones', () => {
  const out = sentences('Hiss. The great vent shudders and a swarm pours out into the dark water. Run.');
  assert.ok(out.length >= 1 && out.every((s) => s.length >= 1));
  assert.equal(out.join(' ').replace(/\s+/g, ' '), 'Hiss. The great vent shudders and a swarm pours out into the dark water. Run.');
});
