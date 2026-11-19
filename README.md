# Argon

> A local Claude Code-style workspace where Argon edits your project files.

Argon is a localhost web app in the style of Claude Code and Cursor: open a local
project folder, browse and edit its files, and chat with Argon in a split
workspace view. Argon reads the files you select as context, drafts changes,
and only writes them after you review a diff and approve it — with a backup
made before every applied edit.

The first version runs entirely locally using [Ollama](https://ollama.com),
with no cloud API key required.

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
| Port | `3000` | `PORT` env var |
| Project root | current directory | `ARGON_PROJECT_ROOT` env var, or Settings in the UI |
| Ollama host | `http://localhost:11434` | `OLLAMA_HOST` env var, or Settings in the UI |
| Ollama model | `qwen2.5-coder:7b` | `OLLAMA_MODEL` env var, or Settings in the UI |

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
