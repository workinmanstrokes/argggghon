# Scope freeze — until the Windows 7–8B loop passes twice

The Game Test Lab's finding was that scope split before proof: the phone
fallback and a 14B trial were being worked on alongside agent roles while
the core Windows + Ollama loop had never passed once. Until the loop passes,
nothing else gets built.

## Frozen until the gate passes

The gate is defined in `docs/v0.11-release-criteria.md`: the Windows 7–8B
loop (prompt → plan → build → run → playtest report) passes **twice in a
row**, with a proof log for each run.

## Parked — do not build until the gate passes

- **Phone fallback.** The phone uses only small on-device models, so it
  cannot substitute as proof for the PC 7–8B workflow. It stays parked; a
  phone run never counts toward the gate.
- **14B model trial.** No 14B run until the 7–8B loop passes twice.
- **Agent roles and multi-step autonomy.** Argon stays propose-and-approve:
  it drafts edits, shows a diff, and writes nothing until the user approves.
  No autonomous terminal commands or multi-step tool calls.
- **New features of any kind.** The only in-scope work is the startup fix,
  the proof loop, the snapshot-restore proof, and the health/status
  visibility that makes failures observable.

## Still in scope

- Fixing startup on the HP laptop (port, Ollama, model) — `STARTUP.md`,
  `npm run doctor`, `GET /api/health`.
- The end-to-end proof with a real Ollama 7–8B model — `npm run proof`,
  `docs/zombie-shootout-proof.md`.
- Proving iteration is safe: break something, restore from the safety
  snapshot — `npm run snapshot-test`, the Backups panel in the UI.
- Recording hard evidence: proof logs in `proof-runs/`, with per-check
  pass/fail, time taken, RAM, token counts, and fix attempts used (0–3).

## Unfreezing

The freeze lifts only when two consecutive proof logs in `proof-runs/`
each record a passed loop (including the manual playtest filled in) on the
HP laptop with a 7–8B model. Mike decides what is built next after that;
the parked items are candidates, not a promise.
