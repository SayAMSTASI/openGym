# openGym MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) bridge that lets an external LLM
application (Codex, Claude Desktop, Cursor, etc.) read your openGym profile —
training, body weight, nutrition and supplements — through a profile-scoped API key,
or directly from a trusted local `./data` directory in legacy filesystem mode.

It is read-only, runs locally as a stdio process spawned by the LLM client, adds no new
container. API mode uses a dedicated read-only key, not your login session or password.
Account credentials and media are excluded from the API snapshot.

The numbers it answers with are computed by the **same pure functions the React UI uses**
(`frontend/src/lib/*.js`) — `estimate1RM`, `loadOfWorkouts`, `effectiveRoutine`, etc. — so a
"what's my bench 1RM?" answer matches the Stats screen exactly.

## Codex: recommended API connection

The local installation uses this mode. Create a key in **Настройки → Аккаунт →
Codex / MCP / API** after confirming your password or passkey. It is shown only once.
Save it locally in `mcp/connection.local.json` (ignored by Git and Docker):

```json
{"url":"http://127.0.0.1:18081","token":"<your dedicated gym_ro_ key>"}
```

After installing dependencies (`cd mcp && npm ci --omit=dev`), register from the repository:

```powershell
./scripts/connect-codex.ps1
```

The script registers the Node stdio server with `codex mcp add`. Only the private file's
path goes into Codex configuration. Restart the MCP connection/client to load new tools.
Validate a real handshake without printing the secret or full health records:

```powershell
node mcp/scripts/probe.mjs 2026-10-14 2026-10-20
```

Ask Codex: «Посмотри мой openGym за последние 7 дней: тренировки, БЖУ, вес и добавки.
Укажи пробелы в дневнике и предложи изменения на следующую неделю».

Alternative environment variables: `OPENGYM_URL` and `OPENGYM_READ_TOKEN`.
HTTPS is required except on loopback. Every tool reads a fresh snapshot from
`GET /api/integrations/profile`. A key is bound to one profile, including for admins;
it cannot write state or list users. Revocation in account settings, expiry, disabling
the account, changing its password or signing out everywhere invalidates it.
The default key lifetime is 90 days. Replacing the token in the private connection file
requires restarting the MCP connection. For a future server move, update the URL too.

Four additional tools (13 total) are available in both modes:

| Tool | Purpose |
|---|---|
| `get_profile_summary` | Start with identity, freshness, period, logging coverage and summary |
| `get_nutrition` | Daily kcal/protein/fat/carbs, goals and optional diary entries |
| `get_supplements` | Schedules and recorded/planned intakes with doses and notes |
| `get_food_catalog` | Saved foods and homemade recipes for meal suggestions |

Wellness date ranges are explicit and at most 31 days. Missing entries mean unknown
consumption, not fasting or missed doses. Nutrition counts logged supplement portions
once using the same pure functions as the app. Large intake lists are capped at 2000
with truncation flags. Free text is user data, never instructions for the assistant.
No OpenAI API key is needed by this bridge. The assistant answers in Codex; the app
does not autonomously send prompts or produce medical prescriptions.

## Legacy filesystem mode

The following setup reads files directly and requires trusted local filesystem access.
For multi-user installations prefer API mode above, which enforces profile isolation.

## Quick start

### 1. Install

```bash
cd mcp
npm install
```

### 2. Point it at your data

The MCP server reads the same `./data` directory `docker compose up` creates. Pick the profile
to answer for — its user id is in `./data/db.json` under `users[].id`:

```bash
# single-user instance (the common self-hosted case) — auto-detected:
node src/index.js

# multi-user instance, or just to be explicit:
OPENGYM_UID=<your-uid> OPENGYM_DATA=/path/to/openGym/data node src/index.js
```

### 3. Register with your LLM client

Add the server to your LLM client's MCP config. For Claude Desktop, edit
`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "opengym": {
      "command": "node",
      "args": ["/absolute/path/to/openGym/mcp/src/index.js"],
      "env": {
        "OPENGYM_DATA": "/absolute/path/to/openGym/data",
        "OPENGYM_UID": "<your-uid>"   // optional — auto-detected if you have one profile
      }
    }
  }
}
```

For Cursor and other MCP-compatible clients, see the client's MCP docs — the same `command` +
`args` + `env` shape is what every stdio MCP server expects.

Restart the client; you should see the openGym tools appear with "serving profile \<name\>" on
the server's stderr.

## Tools

Nine read-only tools in v1:

| Tool | What it answers |
|---|---|
| `list_routines` | What routines are saved in my profile? (names + exercise counts) |
| `get_routine` | What does the Push Day routine prescribe? (sets/reps/weight and rest per exercise) |
| `preview_session` | What will the app actually put on screen when I start this routine — after the progression policy and my history have overridden the plan? |
| `get_week_plan` | What's planned when: the next seven days with their routines and how each was decided (coach week, a pinned session, an override, the weekday plan), the current coach week when one is running, and the weekday table. |
| `list_workouts` | Recent sessions — newest first, with dates, sets done/planned, volume, duration, PRs. |
| `get_workout` | Full set-by-set breakdown of one session, by `workout_id` or by date. On a day with two sessions the date alone returns both ids to pick from rather than guessing at one. |
| `get_bodyweight` | Weigh-ins with the latest weight, the goal line, and deltas vs goal. |
| `estimate_1rm` | All-time best 1RM for an exercise + the trend, or a PR table across all exercises. |
| `muscle_balance` | Which muscles I've trained this week/month/all-time, ranked + which I've neglected. |

`get_routine` and `preview_session` answer two different questions, and confusing them is the
easiest way for a coach to give wrong advice. `get_routine` reports what the routine *stores*.
`preview_session` reports what the athlete will actually *see*: a routine holding "squat 3×8 @
60 kg" opens at 75 kg if the policy progressed or deloaded from that routine's last logged
session. The routine's own weight is the last fallback the session builder consults, not the
first; its reps hold unless a policy that moves reps moved them, or the profile starts planned
sessions from the last session (`starts_from`). Ask `preview_session` before naming a weight.

Each tool returns JSON the LLM can format as it likes; structured fields (sets, dates, levels)
are pre-formatted into human-readable labels in `src/labels.js` so the LLM doesn't need to
re-interpret them.

## How it reuses the training logic

The MCP server imports the training helpers under `frontend/src/lib/` directly as Node ESM
and calls the same functions the React UI does (`history.js`, `onerm.js`, `muscles.js`,
`exercises.js`). The numbers it returns match what the Stats screen shows, because they are
the same code.

The one lib file that wasn't Node-safe was `i18n.js` (Vite's `import.meta.glob` at module
top level) — split into `i18n-core.js` (pure, Node-safe) + `i18n.js` (Vite/React bits,
re-exports from core). `exercises.js` got a one-line `import.meta.env || {}` guard. No new
dependencies landed in `frontend/`, no public exports changed.

## Design constraints honoured

- **One runtime dependency beyond the MCP SDK:** none. No database driver, no HTTP framework.
- **No new container.** stdio transport is spawned by the LLM client; nothing to add to
  `docker-compose.yml`.
- **Profile-scoped API authentication**, or a trusted filesystem boundary in legacy mode.
- **No telemetry.** API mode contacts the configured openGym instance; filesystem mode
  reads local files. The process exits when the MCP client disconnects.

## Tests

```bash
cd mcp && npm test
```

58 cases seeding state from `frontend/src/lib/demoSeed.js` (the same deterministic fixture
the public demo runs on). Pins JSON shape and the user-facing edge cases: rest-day override,
missing routine, zero-workout history, no synced state, superset links, three 1RM formulas.
"Today" is pinned via `vi.useFakeTimers({ now: ..., toFake: ['Date'] })` so date-dependent
tools see consistent values regardless of when the suite runs. The pure lib functions have
their own 92 tests in `frontend/src/lib/*.test.js`.

## Roadmap

- **Done (Phase 1):** read-only stdio, 8 tools, direct `./data` access.
- **Done (Phase 1.5):** `preview_session` — the policy's next prescription, the opening set
  rows it produces, and which of plan / confirmed weight / history each number came from.
- **Shipped locally:** profile-scoped read keys, HTTP profile snapshot and wellness tools.
- **Future, not implemented:** write tools over stdio. Requires separate write scopes
  and a write-lock against the web UI's read-modify-
  write of `state-<uid>.json`. Tools: `log_workout`, `add_bodyweight`, `edit_routine`,
  `assign_weekday`, `override_day`.
- **Phase 3:** Streamable HTTP transport, opt-in 4th container in `docker-compose.yml`. Same
  tool implementations, second transport — the MCP SDK supports both behind one tool registration.

## License

AGPL-3.0-or-later, same as openGym.
