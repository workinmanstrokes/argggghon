// Argon doctor — `npm run doctor`
//
// Answers the first Game Test Lab finding: is Argon actually running on
// this machine, and can it reach Ollama? Prints one PASS/FAIL line per
// check with a plain-language fix for every failure, and exits 0 only when
// every check passes. Run this before adding any feature — nothing else in
// Argon can be tested while the doctor fails.
//
// Uses only the Node standard library and talks to the live server and
// Ollama on this machine; it never invents a result.
//
//   PORT=8080 npm run doctor        check a server on port 8080
//   OLLAMA_HOST=http://localhost:11434 OLLAMA_MODEL=qwen2.5-coder:7b npm run doctor
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

const results = [];

function record(name, ok, detail, fix) {
  results.push({ name, ok, detail, fix });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!ok && fix) console.log(`      Fix: ${fix}`);
}

async function fetchJson(url, timeoutMs = 3000) {
  const started = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const data = await res.json().catch(() => ({}));
  return { res, data, latencyMs: Date.now() - started };
}

async function main() {
  // 1. Node is new enough for Argon (global fetch, AbortSignal.timeout).
  const major = Number(process.versions.node.split('.')[0]);
  record(
    'Node.js 18+ installed',
    major >= 18,
    `Node ${process.versions.node}`,
    'Install Node.js 18 or later from https://nodejs.org, then re-run this check.',
  );

  // 2. Dependencies are installed.
  const expressHere = fs.existsSync(path.join(__dirname, '..', 'node_modules', 'express'));
  record(
    'Dependencies installed',
    expressHere,
    expressHere ? 'express found in node_modules' : 'node_modules/express is missing',
    'From the Argon folder run: npm install',
  );

  // 3. The port Argon will use: either Argon itself is already answering
  // on it (good — it is running), or the port is free (good — it can
  // start). Anything else answering there is a conflict to clear first.
  try {
    const { res, data } = await fetchJson(`http://127.0.0.1:${PORT}/api/health`);
    if (res.ok && data.server === 'argon') {
      record(
        `Port ${PORT} answers as Argon`,
        true,
        `Argon is already running on port ${PORT} (up ${data.uptimeSeconds}s)`,
        null,
      );
    } else {
      record(
        `Port ${PORT} answers as Argon`,
        false,
        `Something else answers on port ${PORT} (HTTP ${res.status})`,
        `On Windows run: netstat -ano | findstr :${PORT} — stop that program (on this laptop the old Diddler Dev Hub has held port 8080), or start Argon on another port: set PORT=3001 && npm start`,
      );
    }
  } catch (err) {
    if (err.cause && err.cause.code === 'ECONNREFUSED') {
      record(`Port ${PORT} is free to start on`, true, `Nothing is listening on port ${PORT}`, null);
    } else {
      record(`Port ${PORT} is free to start on`, false, `Unexpected error: ${err.message}`, `Check the port with: netstat -ano | findstr :${PORT}`);
    }
  }

  // 4. Ollama answers, and how slow it is.
  let ollamaUp = false;
  let models = [];
  let ollamaLatency = null;
  try {
    const { res, data, latencyMs } = await fetchJson(`${OLLAMA_HOST}/api/tags`, 5000);
    ollamaLatency = latencyMs;
    if (res.ok) {
      ollamaUp = true;
      models = (data.models || []).map((m) => m.name);
      record('Ollama is reachable', true, `${OLLAMA_HOST} answered in ${latencyMs} ms`, null);
    } else {
      record('Ollama is reachable', false, `Ollama answered HTTP ${res.status}`, `Restart Ollama, then re-run this check.`);
    }
  } catch (err) {
    record(
      'Ollama is reachable',
      false,
      `Could not reach ${OLLAMA_HOST}: ${err.message}`,
      'Start Ollama first (run `ollama serve` in its own window), then re-run this check.',
    );
  }

  // 5. The model Argon will use is actually pulled.
  if (ollamaUp) {
    const present = models.some((n) => n === OLLAMA_MODEL || n.startsWith(OLLAMA_MODEL + ':'));
    record(
      `Model ${OLLAMA_MODEL} is pulled`,
      present,
      present ? `Found in Ollama (${models.join(', ')})` : `Ollama has: ${models.join(', ') || '(none)'}`,
      `Run: ollama pull ${OLLAMA_MODEL} (a 7-8B model takes a while on first download), then re-run this check.`,
    );
  } else {
    record(`Model ${OLLAMA_MODEL} is pulled`, false, 'Skipped — Ollama is not reachable', 'Fix the Ollama check above first.');
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  if (failed === 0) {
    console.log(`Doctor: all ${results.length} checks passed. Start Argon with: npm start`);
    if (ollamaLatency !== null) console.log(`(Ollama answered in ${ollamaLatency} ms.)`);
  } else {
    console.log(`Doctor: ${failed} of ${results.length} checks failed. Fix the FAIL lines above, then re-run: npm run doctor`);
    console.log('Do not add features until the doctor passes — no test can begin while Argon cannot start.');
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();
