// Bench status: lets someone who is not watching the console (Sponge, from the cloud) tell a bench that
// is working from one that has finished, crashed, been closed, died without a word, or is stuck on the model.
//
// The bench writes <log name>.status.json beside its log and keeps it up to date:
//   state        running, finished, crashed, closed (console window closed), interrupted (Ctrl+C or
//                Ctrl+Break), killed, or ended (exited without a gate line, e.g. a setup message)
//   run, runs    which run it is on
//   step         the last step label it printed ("step 9", "R4 after Bryn")
//   waitingOn    the Director turn it is waiting on the model for, and waitingSince
//   progressAt   when it last printed anything
//   heartbeatAt  refreshed every HEARTBEAT_SECS while the program is alive, even while it waits
//   gate, error, exitCode, endedAt
//   gpus         each NVIDIA GPU's temperature, load, memory and power at the last heartbeat (if
//                nvidia-smi is installed); the same readings are kept in <log name>.gpu.csv
//
// A heartbeat that has gone stale means the program is gone or frozen (power, a forced kill, sleep); a fresh
// heartbeat with no progress means it is waiting on the model. describe() turns the file into one line.

import { writeFileSync, renameSync, appendFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';

export const HEARTBEAT_SECS = 30;
// Longer than the 5-minute limit a local model call has (brain/openai.js), so "stuck" means stuck.
export const STUCK_SECS = 6 * 60;

export function statusPaths(logFile) {
  const base = String(logFile).replace(/\.log$/i, '');
  return { status: `${base}.status.json`, gpu: `${base}.gpu.csv` };
}

function atomicWrite(file, text) {
  try {
    writeFileSync(`${file}.tmp`, text);
    renameSync(`${file}.tmp`, file);
  } catch {
    // Windows refuses the rename while a reader has the file open: write it in place instead.
    writeFileSync(file, text);
  }
}

const iso = (d) => d.toISOString();

export function createStatus(file, info = {}, { now = () => new Date(), write = atomicWrite } = {}) {
  const t = iso(now());
  const st = {
    state: 'running', ...info, pid: process.pid, startedAt: t, heartbeatAt: t, heartbeatEverySecs: HEARTBEAT_SECS,
    progressAt: t, run: 0, step: '', waitingOn: '', waitingSince: '', lastLine: '', gate: '', error: '', exitCode: null, endedAt: '', gpus: [], gpuNote: '',
  };
  let ended = false;
  const save = () => { try { write(file, `${JSON.stringify(st, null, 1)}\n`); } catch { /* the bench goes on without its status */ } };
  save();
  return {
    get: () => st,
    // Every chunk the bench prints passes through here.
    line(text) {
      if (ended) return;
      let changed = false;
      for (const raw of String(text).split(/\r?\n/)) {
        const l = raw.trim();
        if (!l) continue;
        changed = true;
        st.progressAt = iso(now());
        st.lastLine = l.slice(0, 300);
        let m;
        if ((m = /^=== Run (\d+) of (\d+) ===/.exec(l))) { st.run = Number(m[1]); st.runs = Number(m[2]); st.step = ''; }
        else if ((m = /^\[([^\]]+)\]/.exec(l))) { st.step = m[1]; st.waitingOn = ''; st.waitingSince = ''; }
        else if ((m = /^GATE: (PASS|FAIL)/.exec(l))) st.gate = m[1];
      }
      if (changed) save();
    },
    // A Director turn has gone to the model.
    waiting(label) {
      if (ended) return;
      st.waitingOn = label;
      st.waitingSince = iso(now());
      save();
    },
    // That model call is over.
    idle() {
      if (ended || !st.waitingOn) return;
      st.waitingOn = '';
      st.waitingSince = '';
      save();
    },
    beat(gpus, gpuNote) {
      if (ended) return;
      st.heartbeatAt = iso(now());
      if (gpus) st.gpus = gpus;
      if (gpuNote !== undefined) st.gpuNote = gpuNote;
      save();
    },
    end(state, { error = '', exitCode = null } = {}) {
      if (ended) return;
      ended = true;
      st.state = state;
      st.endedAt = iso(now());
      if (error) st.error = String(error).slice(0, 3000);
      if (exitCode !== null && exitCode !== undefined) st.exitCode = exitCode;
      // What it was waiting on when it stopped, if anything.
      if (st.waitingOn) st.stoppedDuring = st.waitingOn;
      st.waitingOn = '';
      save();
    },
  };
}

const NVSMI_FIELDS = ['index', 'name', 'temperature.gpu', 'utilization.gpu', 'memory.used', 'memory.total', 'power.draw'];

export function parseNvidiaSmi(text) {
  const num = (x) => { const n = Number(String(x).trim()); return Number.isFinite(n) ? n : null; };
  return String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(',').map((x) => x.trim());
    return { index: num(c[0]), name: c[1] || '', tempC: num(c[2]), loadPct: num(c[3]), memUsedMiB: num(c[4]), memTotalMiB: num(c[5]), powerW: num(c[6]) };
  }).filter((g) => g.index !== null);
}

// Reads every NVIDIA GPU once. Calls back with (gpus) or (null, note); after "not found" it stops trying.
export function gpuReader({ csvFile = '', now = () => new Date(), run = execFile } = {}) {
  let missing = false;
  return (cb) => {
    if (missing) return cb(null, 'nvidia-smi not found');
    run('nvidia-smi', [`--query-gpu=${NVSMI_FIELDS.join(',')}`, '--format=csv,noheader,nounits'], { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (err) {
        if (err.code === 'ENOENT') missing = true;
        return cb(null, missing ? 'nvidia-smi not found' : `nvidia-smi failed: ${String(err.message).split('\n')[0]}`);
      }
      const gpus = parseNvidiaSmi(stdout);
      if (csvFile && gpus.length) {
        try {
          if (!existsSync(csvFile)) appendFileSync(csvFile, 'time,gpu,name,temp_c,load_pct,mem_used_mib,mem_total_mib,power_w\n');
          const t = iso(now());
          appendFileSync(csvFile, gpus.map((g) => [t, g.index, `"${g.name}"`, g.tempC, g.loadPct, g.memUsedMiB, g.memTotalMiB, g.powerW].join(',')).join('\n') + '\n');
        } catch { /* readings stay in the status file */ }
      }
      cb(gpus, '');
    });
  };
}

const ago = (secs) => (secs < 90 ? `${Math.round(secs)} s` : secs < 5400 ? `${Math.round(secs / 60)} min` : `${(secs / 3600).toFixed(1)} h`);
const local = (isoTime) => (isoTime ? isoTime.replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '?');

export function gpuLine(st) {
  if (!st.gpus || !st.gpus.length) return st.gpuNote ? `GPUs: ${st.gpuNote}` : '';
  return 'GPUs: ' + st.gpus.map((g) => `${g.index} ${g.name.replace(/^NVIDIA (GeForce )?/, '')} ${g.tempC !== null ? Math.round(g.tempC) : '?'}°C, ${g.loadPct ?? '?'}% load, ${g.memUsedMiB !== null && g.memTotalMiB ? `${(g.memUsedMiB / 1024).toFixed(1)}/${(g.memTotalMiB / 1024).toFixed(0)} GB` : '? GB'}, ${g.powerW !== null ? `${Math.round(g.powerW)} W` : '? W'}`).join('; ');
}

// One verdict for a status file: { verdict, text }. verdict is one of running, stuck, gone, finished,
// crashed, closed, interrupted, killed, ended.
export function describe(st, now = new Date()) {
  const where = `${st.run ? `run ${st.run}${st.runs ? ` of ${st.runs}` : ''}` : 'before run 1'}${st.step ? `, after ${st.step}` : ''}${st.stoppedDuring ? `, during ${st.stoppedDuring}` : ''}`;
  const secs = (t) => (t ? (now - new Date(t)) / 1000 : Infinity);
  let verdict = st.state;
  let text;
  if (st.state === 'finished') text = `Finished at ${local(st.endedAt)}: GATE ${st.gate || '?'} (exit code ${st.exitCode ?? '?'}).`;
  else if (st.state === 'crashed') text = `Crashed at ${local(st.endedAt)} in ${where}: ${String(st.error).split('\n')[0]}`;
  else if (st.state === 'closed') text = `The console window was closed at ${local(st.endedAt)}, in ${where}.`;
  else if (st.state === 'interrupted') text = `Stopped by Ctrl+C or Ctrl+Break at ${local(st.endedAt)}, in ${where}.`;
  else if (st.state === 'killed') text = `Killed at ${local(st.endedAt)}, in ${where}.`;
  else if (st.state === 'ended') text = `Ended at ${local(st.endedAt)} without a gate line (exit code ${st.exitCode ?? '?'}), in ${where}. Last line: ${st.lastLine}`;
  else {
    const beat = secs(st.heartbeatAt);
    const every = st.heartbeatEverySecs || HEARTBEAT_SECS;
    if (beat > every * 3) {
      verdict = 'gone';
      text = `Gone: no heartbeat for ${ago(beat)} (last ${local(st.heartbeatAt)}), in ${where}. The program ended or froze without a word: power, a forced kill, a reboot, sleep, or a hang.`;
    } else if (st.waitingOn && secs(st.waitingSince) > STUCK_SECS) {
      verdict = 'stuck';
      text = `Stuck: waiting on the model for ${ago(secs(st.waitingSince))} at ${st.waitingOn}, in ${where}. The program is alive (heartbeat ${ago(beat)} ago).`;
    } else {
      text = `Running: ${where}; ${st.waitingOn ? `waiting on the model for ${ago(secs(st.waitingSince))} at ${st.waitingOn}` : `last output ${ago(secs(st.progressAt))} ago`}; heartbeat ${ago(beat)} ago.`;
    }
  }
  const g = gpuLine(st);
  return { verdict, text: g ? `${text}\n${g}` : text };
}
