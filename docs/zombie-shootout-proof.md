# Zombie shootout — the end-to-end proof app

The Game Test Lab asked for one minimal end-to-end proof with a real Ollama
7–8B model: prompt → plan → build → run → playtest report. This is that
proof, defined so it can be repeated exactly. The scripted half is
`npm run proof`; the playtest half is a person with a browser.

## The app

A single-file browser game, `proof-app/zombie-shootout.html`:

- A `<canvas>` playfield.
- A crosshair the player moves with the mouse.
- Click to shoot; a zombie hit scores a point.
- Zombies spawn at the edges and walk toward the player.
- A 60-second timer; when it hits zero, a game-over screen shows the final
  score.

That is the whole app. Anything more is scope creep for a proof.

## How to run it

Prerequisites: Argon running (`npm start`) and Ollama up with the 7–8B
model pulled. If the doctor fails, fix that first (`STARTUP.md`).

```powershell
npm run proof
```

The script drives Argon through its real loop: it asks for a plan, then
asks for the game as a proposed edit, applies it through the approve path,
and reads the built file back. It records per-check pass/fail, time taken,
RAM, token counts, and fix attempts used (0–3) in a proof log under
`proof-runs/`. It exits 0 only when every automated check passes.

## The playtest (manual — do not fake it)

The script cannot click through a game, so it records the playtest as
`manual-pending` and prints the file to open. To complete a proof run:

1. Open the built file in a browser — double-click
   `proof-app/zombie-shootout.html`, or drag it into the browser window.
2. Play it once through and check each item:
   - [ ] The game loads — no blank screen, no console errors.
   - [ ] Clicking shoots and the score goes up when a zombie is hit.
   - [ ] Zombies keep spawning and walking toward the player.
   - [ ] The 60-second timer counts down and the game-over screen shows
         the final score.
3. Fill in the `playtest` section of that run's log in `proof-runs/`:
   set `status` to `pass` or `fail`, write what happened in `notes`, and
   fill in `playedBy` and `playedAt`. A run only counts toward the v0.11
   gate (two in a row — see `docs/v0.11-release-criteria.md`) once the
   playtest is filled in as `pass`.

## If the Zombie build stalls

If the Zombie shootout fails its build check after 3 fix attempts, record
the stall in the log and run the smaller proof instead — do not keep
hammering the same prompt:

```powershell
set PROOF_APP=small
npm run proof
```

The small proof is a target-tap game: targets pop up at random positions
for 30 seconds, clicking one scores a point, and a game-over screen shows
the final score. It proves the same loop with less for the model to get
wrong. The stall and the switch must both be visible in the logs.
