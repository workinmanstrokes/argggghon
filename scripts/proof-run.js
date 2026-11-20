// Argon proof run — `npm run proof`
//
// Runs the minimal end-to-end proof the Game Test Lab asked for, against a
// LIVE Argon server on this machine:
//
//   prompt -> plan -> build -> run -> playtest report
//
// using the Zombie shootout game (see docs/zombie-shootout-proof.md), or a
// smaller target-tap game with PROOF_APP=small if the Zombie build stalls.
//
// What it records (the proof log, not chat screenshots):
//   - per-check pass/fail for health, plan, build, run
//   - time taken per step, RAM before/after, token counts from Ollama
//   - fix attempts used (0-3) when a proposed build is invalid
//   - the playtest step, which is manual: the script prints the file to
//     open and the checklist, and records it as "manual-pending" until a
//     person plays it and fills in the result (see the proof doc).
//
// The log is written to <project root>/proof-runs/<timestamp>.json and the
// script exits 0 only when every automated check passes.
//
// Requires: Argon running (`npm start`) and Ollama up with the model
// pulled. Run `npm run doctor` first if anything fails.
//
//   ARGON_URL=http://localhost:3000 PROOF_APP=zombie npm run proof
//   ARGON_URL=http://localhost:8080 PROOF_APP=small npm run proof
const fs = require('fs');
const path = require('path');

const ARGON_URL = (process.env.ARGON_URL || 'http://localhost:3000').replace(/\/$/, '');
const PROOF_APP = process.env.PROOF_APP || 'zombie'; // zombie | small
const MAX_FIX_ATTEMPTS = 3;

const APPS = {
  zombie: {
    file: 'proof-app/zombie-shootout.html',
    title: 'Zombie shootout',
    planPrompt:
      'Plan a minimal Zombie shootout browser game in a single HTML file. ' +
      'Reply with a short numbered plan only, no code yet: what the player does, ' +
      'how zombies spawn and move, how shooting and scoring work, and how the game ends.',
    buildPrompt:
      'Now build it. Reply with ONLY one fenced block ```edit:proof-app/zombie-shootout.html ' +
      'containing the complete single-file HTML game: a <canvas>, a crosshair the player moves ' +
      'with the mouse, click to shoot, zombies that spawn at the edges and walk toward the player, ' +
      'score for each zombie hit, a 60-second timer, and a game-over screen with the final score. ' +
      'No other text outside the fenced block.',
    mustContain: ['<canvas', '</html>', 'score'],
  },
  small: {
    file: 'proof-app/target-tap.html',
    title: 'Target tap (small fallback)',
    planPrompt:
      'Plan a minimal target-tap browser game in a single HTML file. ' +
      'Reply with a short numbered plan only, no code yet: how targets appear and move, ' +
      'how tapping scores, and how the game ends.',
    buildPrompt:
      'Now build it. Reply with ONLY one fenced block ```edit:proof-app/target-tap.html ' +
      'containing the complete single-file HTML game: a <canvas>, targets that pop up at random ' +
      'positions, click a target to score a point, a 30-second timer, and a game-over screen ' +
      'with the final score. No other text outside the fenced block.',
    mustContain: ['<canvas', '</html>', 'score'],
  },
};

const app = APPS[PROOF_APP];
if (!app) {
  console.error(`Unknown PROOF_APP=${PROOF_APP}. Use zombie or small.`);
  process.exit(1);
}

const checks = [];
const log = {
  tool: 'npm run proof',
  startedAt: new Date().toISOString(),
  argonUrl: ARGON_URL,
  app: PROOF_APP,
  appTitle: app.title,
  checks,
  attemptsUsed: 0,
  memory: {},
  playtest: null,
  result: 'not-run',
};

function check(name, status, detail, durationMs) {
  const entry = { name, status, detail, durationMs: durationMs ?? null };
  checks.push(entry);
  console.log(`${status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'TODO'}  ${name} — ${detail}`);
  return entry;
}

async function api(apiPath, opts) {
  const res = await fetch(ARGON_URL + apiPath, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function parseEditBlock(text) {
  const match = text.match(/```edit:([^\n`]+)\n([\s\S]*?)```/);
  return match ? { path: match[1].trim(), content: match[2] } : null;
}

async function timed(fn) {
  const started = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - started };
}

async function main() {
  console.log(`Proof run: ${app.title} against ${ARGON_URL}`);
  console.log('');

  // 1. Health — the server must be up, Ollama reachable, model pulled.
  let projectRoot = null;
  try {
    const { result: health, durationMs } = await timed(() => api('/api/health'));
    projectRoot = health.projectRoot;
    log.memory.before = health.memory;
    const ok = health.ollama.reachable && health.ollama.modelPresent;
    check(
      'health',
      ok ? 'pass' : 'fail',
      ok
        ? `Argon up ${health.uptimeSeconds}s on port ${health.port}; Ollama reachable in ${health.ollama.latencyMs} ms; model ${health.ollamaModel} pulled; Argon using ${health.memory.processRssMB} MB`
        : `Ollama reachable=${health.ollama.reachable}, model ${health.ollamaModel} present=${health.ollama.modelPresent}`,
      durationMs,
    );
    if (!ok) throw new Error('Health check failed — run `npm run doctor` and fix it first.');
  } catch (err) {
    if (!checks.some((c) => c.name === 'health')) {
      check('health', 'fail', `Could not reach Argon at ${ARGON_URL}: ${err.message}`, null);
    }
    return finish(1);
  }

  // 2. Plan — ask Argon to plan the game, record time and tokens.
  let planReply = '';
  try {
    const { result, durationMs } = await timed(() =>
      api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: app.planPrompt }),
      }),
    );
    planReply = result.reply || '';
    const usage = result.usage || {};
    check(
      'plan',
      planReply.trim().length > 50 ? 'pass' : 'fail',
      `Argon returned a ${planReply.trim().length}-character plan in ${durationMs} ms` +
        (usage.promptTokens != null ? ` (${usage.promptTokens} prompt / ${usage.responseTokens} response tokens)` : ''),
      durationMs,
    );
    if (planReply.trim().length <= 50) throw new Error('Plan step returned too little to be a plan.');
  } catch (err) {
    if (!checks.some((c) => c.name === 'plan')) check('plan', 'fail', err.message, null);
    return finish(1);
  }

  // 3. Build — ask for the game file, validate it, retry up to 3 fixes.
  let built = null;
  let fixNote = '';
  for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const prompt =
      attempt === 0
        ? app.buildPrompt
        : `${app.buildPrompt}\n\nYour previous reply failed validation: ${fixNote} Fix exactly that and reply with only the fenced edit block.`;
    const { result, durationMs } = await timed(() =>
      api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }),
    );
    const proposal = parseEditBlock(result.reply || '');
    if (!proposal) {
      fixNote = 'no ```edit: block found in the reply';
    } else if (proposal.path !== app.file) {
      fixNote = `proposed path was ${proposal.path}, expected ${app.file}`;
    } else {
      const missing = app.mustContain.filter((s) => !proposal.content.includes(s));
      if (missing.length) fixNote = `built file is missing: ${missing.join(', ')}`;
      else {
        built = { proposal, durationMs, usage: result.usage || {} };
        break;
      }
    }
    log.attemptsUsed = attempt + 1;
    console.log(`  build attempt ${attempt + 1} invalid: ${fixNote}`);
    if (attempt === MAX_FIX_ATTEMPTS) {
      check('build', 'fail', `No valid build after ${MAX_FIX_ATTEMPTS} fix attempts. Last failure: ${fixNote}`, durationMs);
      return finish(1);
    }
  }
  // Apply the validated build through Argon's own approve path (POST /api/file
  // is what the UI's Approve button calls, so this exercises the real flow).
  try {
    await api('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: built.proposal.path, content: built.proposal.content }),
    });
    const usage = built.usage;
    check(
      'build',
      'pass',
      `Built ${built.proposal.path} (${built.proposal.content.length} bytes) in ${built.durationMs} ms` +
        `, fix attempts used: ${log.attemptsUsed}` +
        (usage.promptTokens != null ? ` (${usage.promptTokens} prompt / ${usage.responseTokens} response tokens)` : ''),
      built.durationMs,
    );
  } catch (err) {
    check('build', 'fail', `Applying the build failed: ${err.message}`, built.durationMs);
    return finish(1);
  }

  // 4. Run — the built file must be readable back through Argon's own API
  // and be a complete HTML document. (Argon serves only its own UI over
  // HTTP, so the playtest opens the file in a browser — see step 5.)
  try {
    const { result, durationMs } = await timed(() => api(`/api/file?path=${encodeURIComponent(app.file)}`));
    const missing = app.mustContain.filter((s) => !result.content.includes(s));
    check(
      'run',
      missing.length === 0 ? 'pass' : 'fail',
      missing.length === 0
        ? `${app.file} reads back through Argon (${result.content.length} bytes, complete HTML document)`
        : `Built file reads back but is missing: ${missing.join(', ')}`,
      durationMs,
    );
    if (missing.length) return finish(1);
  } catch (err) {
    check('run', 'fail', `Could not read the built file back: ${err.message}`, null);
    return finish(1);
  }

  // 5. Playtest — manual. This script cannot click through a game, so it
  // does not fake a playtest result: it records the step as pending with
  // the exact file and checklist, and the loop only counts as passed once
  // a person fills it in (docs/zombie-shootout-proof.md).
  const playtestPath = path.join(projectRoot || process.cwd(), app.file);
  log.playtest = {
    status: 'manual-pending',
    file: playtestPath,
    checklist: [
      'Open the file in a browser (double-click it, or drag it into the browser).',
      'The game loads with no blank screen and no console errors.',
      'Clicking shoots / taps a target and the score goes up.',
      'The timer counts down and the game-over screen shows the final score.',
    ],
    notes: '',
    playedBy: '',
    playedAt: '',
  };
  check(
    'playtest',
    'manual-pending',
    `Manual step — open ${playtestPath} in a browser and work through the checklist in docs/zombie-shootout-proof.md, then fill in the playtest section of the log.`,
    null,
  );

  // Final memory snapshot for the log.
  try {
    const health = await api('/api/health');
    log.memory.after = health.memory;
  } catch { /* memory-after is nice to have, not a gate */ }

  console.log('');
  console.log('Automated checks passed. The loop counts as passed only after the manual playtest above is done and recorded.');
  return finish(0);

  function finish(code) {
    log.result = code === 0 ? 'automated-pass-playtest-pending' : 'failed';
    log.finishedAt = new Date().toISOString();
    const dir = path.join(projectRoot || process.cwd(), 'proof-runs');
    fs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(dir, `${log.startedAt.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`Proof log written to: ${logPath}`);
    process.exit(code);
  }
}

main();
