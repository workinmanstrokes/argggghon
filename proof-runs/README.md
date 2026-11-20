# proof-runs/ — end-to-end proof logs

Each file here is one `npm run proof` run: the hard evidence for the
Windows 7–8B loop, written by the script — not by hand, and never from
chat screenshots. Commit real logs as they are written. Never hand-edit a
log's check results; if a run went wrong, say so in a new run.

## Log format

```json
{
  "tool": "npm run proof",
  "startedAt": "2026-11-20T12:00:00.000Z",
  "finishedAt": "2026-11-20T12:05:00.000Z",
  "argonUrl": "http://localhost:3000",
  "app": "zombie",
  "appTitle": "Zombie shootout",
  "checks": [
    { "name": "health", "status": "pass", "detail": "...", "durationMs": 120 },
    { "name": "plan", "status": "pass", "detail": "...", "durationMs": 45000 },
    { "name": "build", "status": "pass", "detail": "...", "durationMs": 90000 },
    { "name": "run", "status": "pass", "detail": "...", "durationMs": 80 },
    { "name": "playtest", "status": "manual-pending", "detail": "...", "durationMs": null }
  ],
  "attemptsUsed": 0,
  "memory": {
    "before": { "processRssMB": 60, "systemFreeMB": 8000 },
    "after": { "processRssMB": 62, "systemFreeMB": 7900 }
  },
  "playtest": {
    "status": "manual-pending",
    "file": "<absolute path to the built game>",
    "checklist": ["..."],
    "notes": "",
    "playedBy": "",
    "playedAt": ""
  },
  "result": "automated-pass-playtest-pending"
}
```

- `status` per check is `pass`, `fail`, or `manual-pending` (playtest only).
- `attemptsUsed` is the number of fix retries the build needed (0–3).
- `result` is `automated-pass-playtest-pending` or `failed`. A run counts
  toward the v0.11 gate only after a person fills in the `playtest` section
  as `pass` — see `docs/zombie-shootout-proof.md` and
  `docs/v0.11-release-criteria.md`.

## How to make one

```powershell
npm run doctor
npm start
npm run proof
```

Then playtest the built game and fill in the log's playtest section.
