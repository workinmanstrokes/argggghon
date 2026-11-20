# Starting Argon on the HP laptop (Windows)

The Game Test Lab's first finding was blunt: Argon was not running on the
laptop and port 8080 was not responding, so no test could even begin. This
page is the exact startup procedure and the exact errors, so the next run
either boots or says precisely why it did not. Add no new features until
`npm run doctor` passes.

## Known state (2026-11-20, from the VEX test)

- Argon v0.11 was not running on the HP laptop.
- Port 8080 did not respond. The old Diddler Dev Hub (an earlier, no-password
  server) has occupied port 8080 before — if it is still running, Argon
  cannot bind that port.
- The Zombie shootout proof app had not been built, run, or playtested.
- Nothing below has been run on the laptop yet. The first successful run
  must be recorded in a proof log (`npm run proof`), not claimed from memory.

## Prerequisites

1. **Node.js 18 or later** — https://nodejs.org (needed for `fetch` and
   `AbortSignal.timeout` in `server.js`).
2. **Ollama** — https://ollama.com, installed and running.
3. **A 7–8B model pulled** (the proof model):
   ```powershell
   ollama pull qwen2.5-coder:7b
   ```

## Start it

From the Argon folder (the folder containing `server.js`):

```powershell
npm install
npm run doctor
npm start
```

Then open http://localhost:3000 in a browser.

### Port 8080

Argon defaults to port **3000**. The v0.11 tester setup used **8080**; to run
there instead:

```powershell
set PORT=8080 && npm start
```

If port 8080 is already taken you will see, in plain language:

```
Port 8080 is already in use — Argon cannot start.
On Windows, find what holds it with: netstat -ano | findstr :8080
Stop that program (on this laptop the old Diddler Dev Hub has held port 8080),
or start Argon on another port with: set PORT=3001 && npm start
```

Fix it one of two ways:

- **Stop the program holding the port.** Find it with
  `netstat -ano | findstr :8080`, note the PID in the last column, and stop
  it (for the old Diddler Dev Hub: Ctrl+C in its window). Then start Argon.
- **Or use another port**: `set PORT=3001 && npm start`, then open
  http://localhost:3001. When you run the proof, tell it the URL:
  `set ARGON_URL=http://localhost:3001 && npm run proof`.

## How to confirm it is running

1. `npm run doctor` — every check must say PASS. It checks Node, the
   dependencies, whether the port is free or already answering as Argon,
   whether Ollama answers, and whether the model is pulled.
2. Open http://localhost:3000/api/health — it must return JSON with
   `"ok": true`, `"ollama": { "reachable": true, "modelPresent": true }`,
   and the memory numbers.
3. In the workspace UI, the status bar under the top bar must show
   `Server: running`, `Ollama: reachable`, and the model name — green means
   it works, red names the problem.

## Error table

| What you see | What it means | Fix |
| --- | --- | --- |
| `Port 3000 is already in use` | Another program holds the port | See "Port 8080" above |
| `Ollama NOT reachable at http://localhost:11434` (at startup) | Ollama is not running | Run `ollama serve` in its own window, then restart Argon |
| `Model qwen2.5-coder:7b is NOT pulled` (at startup) | Ollama is up but the model is missing | `ollama pull qwen2.5-coder:7b` |
| Chat returns `Could not reach Ollama` / HTTP 502 | Ollama stopped or moved | Check `ollama list` and the Ollama host in Settings |
| Chat returns `Ollama returned 404` | The model name is wrong or not pulled | `ollama pull <model>` or pick a pulled model in Settings |

## After it boots

Run the end-to-end proof (docs/zombie-shootout-proof.md):

```powershell
npm run proof
npm run snapshot-test
```

Both write their evidence to `proof-runs/` (proof log) and print PASS/FAIL
per step. A run counts only when the log says so.
