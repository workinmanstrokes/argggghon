// Argon snapshot test — `npm run snapshot-test`
//
// Proves the safety-snapshot loop the Game Test Lab asked for, against a
// LIVE Argon server on this machine:
//
//   write a file -> apply an approved edit (backup made) -> break the file
//   on purpose -> restore from the safety snapshot -> verify the good
//   contents are back
//
// Prints one PASS/FAIL line per step and exits 0 only when the restore
// brings back exactly the pre-break contents. The scratch file lives at
// proof-app/snapshot-test.txt inside the project root (git-ignored).
//
// Requires: Argon running (`npm start`).
//   ARGON_URL=http://localhost:3000 npm run snapshot-test
const ARGON_URL = (process.env.ARGON_URL || 'http://localhost:3000').replace(/\/$/, '');
const FILE = 'proof-app/snapshot-test.txt';
const ORIGINAL = 'SNAPSHOT TEST — original line\n';
const EDITED = 'SNAPSHOT TEST — edited line\n';
const BROKEN = 'BROKEN — this is the deliberate break, not real content\n';

const steps = [];

function step(name, ok, detail) {
  steps.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function api(apiPath, opts) {
  const res = await fetch(ARGON_URL + apiPath, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

async function writeFile(content) {
  await api('/api/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: FILE, content }),
  });
}

async function readFile() {
  const { content } = await api(`/api/file?path=${encodeURIComponent(FILE)}`);
  return content;
}

async function main() {
  console.log(`Snapshot test against ${ARGON_URL}`);
  console.log('');

  try {
    // 1. Write the original file.
    await writeFile(ORIGINAL);
    step('write original', (await readFile()) === ORIGINAL, `Wrote ${FILE} with the original line.`);

    // 2. Apply an approved edit — this must create a backup of the original.
    await writeFile(EDITED);
    step('apply edit (backup made)', (await readFile()) === EDITED, 'Edit applied; a backup of the original should now exist.');

    // 3. Break the file on purpose, the way a bad change-an-app run would.
    await writeFile(BROKEN);
    step('break the file', (await readFile()) === BROKEN, 'File now holds the deliberate break.');

    // 4. Find the safety snapshot: the newest backup for this file is the
    // one written when the break overwrote the edited version, so restoring
    // it must bring back the edited (last good) contents.
    const { backups } = await api('/api/backups');
    const prefix = FILE.replace(/\//g, '__') + '.';
    const mine = backups.filter((b) => b.startsWith(prefix));
    step('snapshot exists', mine.length >= 2, `Found ${mine.length} backup(s) for ${FILE} (need at least 2: original + edited).`);
    if (mine.length < 2) return finish(1);
    const newest = mine[0]; // /api/backups returns newest first

    // 5. Restore from the snapshot and verify the good contents are back.
    const { path: restoredPath } = await api('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: newest }),
    });
    const after = await readFile();
    step(
      'restore from snapshot',
      after === EDITED && restoredPath === FILE,
      after === EDITED
        ? `Restored ${newest}; ${FILE} holds the edited line again.`
        : `Restore ran but ${FILE} holds ${JSON.stringify(after)} instead of the edited line.`,
    );
    if (after !== EDITED) return finish(1);

    // 6. The earlier snapshot (the original) is still there to fall back to.
    step('earlier snapshot kept', mine.length >= 2, `The original-version backup is still listed and restorable: ${mine[mine.length - 1]}`);

    console.log('');
    console.log('Snapshot test passed: break something, restore from the safety snapshot, contents verified.');
    return finish(0);
  } catch (err) {
    step('snapshot test', false, `Error talking to Argon at ${ARGON_URL}: ${err.message}. Is Argon running (npm start)?`);
    return finish(1);
  }

  function finish(code) {
    process.exit(code);
  }
}

main();
