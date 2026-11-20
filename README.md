# Argon

> A local Claude Code-style workspace where Argon edits your project files.

Argon is a localhost web app in the style of Claude Code and Cursor: open a local
project folder, browse and edit its files, and chat with Argon in a split
workspace view. Argon reads the files you select as context, drafts changes,
and only writes them after you review a diff and approve it — with a backup
made before every applied edit.

The first version runs entirely locally using [Ollama](https://ollama.com),
with no cloud API key required.

> Name note: this Argon is a local coding workspace. It is not affiliated
> with any retro-gaming product called Argon — the shared name makes this
> build hard to find in search, so say "Argon local coding workspace" when
> pointing people at it.

## Features

- Open a local project folder and browse it in a file tree, sandboxed to that project root
- Open, view, and edit files in a built-in editor with save
- Chat with Argon with selected and open files sent as context
- Mention files in chat (`@path/to/file`) to add them to Argon's context
- Argon returns proposed changes as file edits with a diff preview
- Approve or reject each proposed edit before anything is written to disk
- Automatic backup of a file before an approved edit is applied, with restore
- Persistent chat sessions per project, so work can be resumed later
- Settings for Ollama host, model, and project root
- Status bar showing server, Ollama, model, latency, and RAM, polled live from `GET /api/health`
- Backups panel listing safety snapshots with one-click restore

## Requirements

- [Node.js](https://nodejs.org) 18 or later
- [Ollama](https://ollama.com) running locally, with a model pulled, for example:

```bash
ollama pull qwen2.5-coder:7b
```

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

| Setting | Default | Override |
| --- | --- | --- |
| Port | `3000` | `PORT` env var (the v0.11 tester setup used `8080` — see `STARTUP.md`) |
| Project root | current directory | `ARGON_PROJECT_ROOT` env var, or Settings in the UI |
| Ollama host | `http://localhost:11434` | `OLLAMA_HOST` env var, or Settings in the UI |
| Ollama model | `qwen2.5-coder:7b` | `OLLAMA_MODEL` env var, or Settings in the UI |

## Startup on the HP laptop (Windows)

See `STARTUP.md` for the exact startup steps, the port-8080 conflict, and
the error table. The short version:

```bash
npm run doctor   # every check must say PASS before anything else
npm start
```

`npm run doctor` checks Node, the dependencies, whether the port is free
or already answering as Argon, whether Ollama answers, and whether the
model is pulled — with a plain-language fix for each failure. The server
also prints the Ollama status at startup and a plain-language fix if its
port is already taken, and `GET /api/health` reports server uptime, RAM,
and a live Ollama probe at any time.

**Status (2026-11-20):** Argon was not running on the laptop and port 8080
did not respond when the Game Test Lab tested it. The startup steps above
have not been run on the laptop yet — the first successful run must be
recorded in a proof log, not claimed from memory.

## Proof runs (Game Test Lab findings)

The Lab scored the build 4/10: a well-structured builder on paper that had
not proven it could build anything on its target laptop. The proof loop is
defined in `docs/v0.11-release-criteria.md` and the proof app in
`docs/zombie-shootout-proof.md`:

```bash
npm run proof          # prompt -> plan -> build -> run -> playtest report (Zombie shootout)
npm run snapshot-test  # break a file, restore from the safety snapshot, verify
```

`npm run proof` writes a proof log to `proof-runs/` with per-check
pass/fail, time taken, RAM, token counts, and fix attempts used (0–3). The
playtest step is manual and recorded as such — the script does not fake it.
v0.11 is done when the Windows 7–8B loop passes **twice in a row**; see the
release criteria for the full gate.

## Workspace UI

- **Top bar:** project root, new session, Settings.
- **Status bar** (under the top bar): server, Ollama, model, latency, and
  RAM — green means it works, red names the problem. Refreshed every
  10 seconds from `GET /api/health`.
- **Left pane:** file tree, chat sessions list, context files for Argon,
  and the Backups panel (safety snapshots with one-click Restore).
- **Middle pane:** code editor with save, and the diff review panel for a
  proposed edit (Approve & apply / Reject).
- **Right pane:** Argon chat, with `@path/to/file` mentions and the hint
  that nothing is written until an edit is approved.
- **Errors in the UI:** chat failures show the error in the chat log
  (for example, when Ollama is down); the status bar shows Ollama and model
  problems before chat is even tried.

## Performance numbers

There were no performance numbers at all before this update. Now:

- `GET /api/health` returns Argon process RAM, system free/total RAM,
  uptime, and a live Ollama latency probe.
- `POST /api/chat` returns `usage` (`promptTokens`, `responseTokens`,
  `totalMs`) from Ollama alongside the reply.
- Proof logs record time per step, RAM before/after, token counts, and fix
  attempts, so build success rate and fix-it success rate can be counted
  from the logs across runs.

## Scope freeze

Scope is frozen until the Windows 7–8B loop passes twice in a row — see
`SCOPE-FREEZE.md`. Parked: the phone fallback (small on-device models
cannot substitute as proof for the PC 7–8B workflow), the 14B trial, and
agent roles / multi-step autonomy. In scope only: the startup fix, the
proof loop, the snapshot-restore proof, and the health/status visibility.

## Safety

- **Sandbox:** every file read or write is checked to stay inside the chosen
  project root. Paths that escape the root (for example `../`) are rejected.
- **Approval first:** Argon never writes a file on its own. Proposed edits
  appear as diffs; nothing is written until you click Approve.
- **Backups:** before an approved edit is applied, the previous contents are
  saved under `.argon-backups/` (timestamped), and can be restored from the UI.
- **Local only:** the server binds to `localhost` and talks only to your local
  Ollama instance. No code or chat leaves your machine.

## How it works

1. The Express server in `server.js` serves the workspace UI and exposes
   sandboxed file APIs (`/api/files`, `/api/file`) plus a chat endpoint
   (`/api/chat`) that proxies to Ollama.
2. The frontend (`public/`) is a split view: file tree on the left, editor in
   the middle, Argon chat on the right.
3. Chat history is stored per project under `.argon-data/` so sessions can be
   resumed later. That folder (and `.argon-backups/`) is git-ignored.
4. `GET /api/health` probes Ollama live and reports server uptime, RAM, and
   model status for the status bar, `npm run doctor`, and proof runs.

## Build milestones

1. Localhost skeleton: Express server serves the workspace UI and lists files in a chosen project root
2. File tree and editor: open, edit, and save files through the local API
3. Chat wired to Ollama: send selected file contents as context and persist chat history per project
4. Edit proposals: Argon returns structured file edits shown as diffs with approve and reject
5. Safety: enforce the project-root sandbox, back up files before applying edits, and add restore
6. Polish: settings, multiple chat sessions, and a README with run and safety instructions

## Open questions

- Which model backend should Argon use by default — a local Ollama model, or an Anthropic/OpenAI API key?
- Is Argon an existing model or agent to integrate, or just the name for this assistant?
- Should Argon act autonomously with multi-step tool calls and terminal commands, or only propose edits for approval?
- Should it support multiple projects at once, or one project folder per launch?
