# WareOrb local presentation demo

One command starts everything on the presentation computer. There is no login screen; the page is
signed in as the "Demo presenter" (owner) and uses **synthetic demo data** in a local database that
persists between runs.

```sh
bun install --frozen-lockfile
bun run demo              # start (first run creates everything); Ctrl+C stops
bun run demo:reset        # same, but reload the synthetic demo data
bun scripts/demo.ts --setup-only   # prepare backend + data, then exit (no web server)
```

Open **http://127.0.0.1:3000**. Data lives in `.convex/local/` (git-ignored); the local backend log
is `.convex/demo-backend.log`.

## What runs

| Part | Where | Notes |
| --- | --- | --- |
| Local Convex backend (accountless) | `http://127.0.0.1:3210` (+ HTTP actions on `:3211`) | Created by the Convex CLI with `CONVEX_AGENT_MODE=anonymous`; never a cloud deployment |
| WareOrb web server + local agent service | `http://127.0.0.1:3000` | Mints the presenter's token, serves `/api/agent/*`, and the photo-reading bridge |
| Pi warehouse analyst | inside the web server | Uses the operator's Pi login; only four read-only warehouse tools |

## Requirements

- **Bun** (project dependencies are pinned in `bun.lock`).
- **Node.js 20, 22 or 24** for the local backend's Node actions. Found automatically from `PATH`,
  Homebrew (`brew install node@24`, keg-only is fine), `/opt/node2x`, nvm, fnm or Volta; or set
  `WAREORB_CONVEX_NODE=/path/to/node`.
- The **first run downloads** the local Convex backend binary from github.com.
- **Chrome** for live voice transcripts (see Voice below).

## One-time operator setup for the agent (outside the app)

Credentials never go into the browser, the repository or `.env.local`.

```sh
cd ~ && pi        # Pi 1.4 CLI (Homebrew: pi-coding-agent)
/login            # choose OpenAI (ChatGPT Plus/Pro) or Anthropic (API key)
/quit
```

Credentials are stored by Pi in `~/.pi/agent/auth.json`. The demo picks the first logged-in of
`openai-codex/gpt-6.1-sol` and `anthropic/claude-sonnet-5-5`; override with
`WAREORB_AGENT_MODEL=provider/model`. Alternatively export `ANTHROPIC_API_KEY` in the shell that runs
`bun run demo` (it is passed only to the local server process). Without any login, the app still
works for manual receiving and Jarvis shows **"Agent not connected"** with these steps — never a
scripted answer.

## Optional settings (shell environment)

| Variable | Default | Purpose |
| --- | --- | --- |
| `WAREORB_DEMO_PORT` | `3000` | Web page and local agent service |
| `WAREORB_CONVEX_PORT` | `3210` | Local Convex API |
| `WAREORB_CONVEX_SITE_PORT` | Convex port + 1 | Local Convex HTTP actions |
| `WAREORB_CONVEX_NODE` | auto | Node 20/22/24 binary or directory |
| `WAREORB_AGENT_MODEL` | auto | `provider/model` for Pi |

`.env.local` is written by the demo (mode 600): `CONVEX_DEPLOYMENT=anonymous:…`, loopback
`CONVEX_URL`/`CONVEX_SITE_URL`, the presenter's private key, the public JWKS, and the agent bridge
secret. Never commit or share it.

## Isolation guarantees

Before writing any file or running any command, `bun run demo` checks every source the Convex CLI
reads and refuses to start if `.env.local` or `.env` contains `CONVEX_DEPLOY_KEY`,
`CONVEX_DEPLOYMENT_TOKEN`, `CONVEX_SELF_HOSTED_URL`/`_ADMIN_KEY`, `CONVEX_OVERRIDE_ACCESS_TOKEN`,
`CONVEX_PROVISION_HOST`, a non-`anonymous:` `CONVEX_DEPLOYMENT`, or a Convex URL other than exactly
`http://127.0.0.1:<expected port>`. The same selectors in your shell are dropped (reported by name)
and every child process gets an allow-listed environment. After the CLI creates or updates the
deployment, the URLs are re-checked before any bearer token is sent, the presenter is bootstrapped
or data is seeded. The web server, the browser page and the Convex functions each refuse demo mode
off this computer; `bun run build` and `scripts/build-production.ts` refuse demo variables.
If a check fails, move the offending `.env*` file aside or use a separate checkout.

## Using the demo

- **Receive by photo**: Receive → open a receipt → photo icon (or the scan icon in Jarvis). Then
  **Read with Pi agent**. The agent fills an editable draft: SKU, qty, unit, condition, packages,
  L×W×H (cm), weight per item, per package and stated total. Unknown values stay blank.
  Unreadable parts become questions on the lines. A blurred or unreadable photo produces no lines and
  an error; enter the counted lines by hand.
- **Receive by voice**: microphone icon on the receipt. The **original recording is always kept**
  as evidence. A transcript is added when Chrome's built-in speech recognition works (Chrome,
  microphone permission and an internet connection). Without one, the recording is kept with a
  "no transcript" note. Pi models do not transcribe audio; no paid speech service is used in demo mode.
- **Typed notes**: note icon on the receipt.
- **Measurements**: blank means unknown. Text such as `6kg`, `1,5` or `abc` is refused with a reason
  (never silently treated as unknown or zero). Each line shows its weight with the basis (per item,
  per package or stated total), volume, mismatches and what is missing. Receipt totals say
  "at least … (incomplete)" or "unknown" instead of a misleading zero.
- **Posting**: every line needs a SKU, counted quantity, bays, the "counted and checked" box and a
  condition confirmed as **Good** (an unstated condition stays blank until you confirm it). Posting
  is idempotent: a retried post never adds stock twice.
- **Jarvis**: free text goes to the Pi analyst. Each tool call shows its arguments, result and
  duration; the answer streams; the header shows the provider/model; **Stop** cancels. `/commands`
  still open panels directly.
- **Replenish**: one plan shared by the panel and the agent. Open orders reserve budget at their
  own recorded cost and bays for their arrival. Suggestions then claim the remaining budget and bays
  in priority order (least cover first), so they fit together. Items without cost or with too
  little history are listed with the reason, not a number. Purchases are recorded by a person.

## Troubleshooting

| Message | Fix |
| --- | --- |
| `Local demo refused to start: … .env.local sets CONVEX_DEPLOY_KEY …` | Move `.env.local` aside or use a separate checkout |
| `Port 3210 (local Convex) is already in use` | Stop the other program or `WAREORB_CONVEX_PORT=3220 bun run demo` |
| `The local Convex backend needs Node.js 20, 22, 24` | Install Node 24 or set `WAREORB_CONVEX_NODE` |
| `convex dev failed … github.com` | First run needs internet to download the backend |
| Jarvis: "Agent not connected" | Do the one-time `pi` → `/login` step; **Check again** (no restart needed) |
| Jarvis: "The provider rejected the credentials" | Log in again with `pi` → `/login` |
| Voice note says "No transcript" | Use Chrome, allow the microphone, check the internet; the recording is kept anyway |

## Tests

```sh
bun run check            # unit + Convex tests, both typechecks, production build
bun run test:browser     # Chromium harness: Jarvis streaming + measurements (needs Playwright)
```

Agent tests use Pi's scripted **faux provider** and say so ("mocked provider"). They prove the
wiring, not a live model. `WAREORB_E2E_LIVE=1 bun run test:browser` repeats the browser check
against your real provider login, using synthetic data only.

## Presentation-Mac smoke test (live checks)

Run these in order on the presentation Mac after the one-time `pi` → `/login`:

1. `bun install --frozen-lockfile && bun run check` — all green.
2. `bun run demo:reset`. Expect `Loaded/Reloaded the synthetic demo data` and
   `Agent: Pi · <provider>/<model>`.
3. `curl -s http://127.0.0.1:3000/api/agent/status` shows `"ready":true`.
   `curl -s -H 'Origin: https://evil.example' http://127.0.0.1:3000/api/demo/token` is refused (403).
4. Open http://127.0.0.1:3000 in Chrome. Check there is no login screen and the header shows
   "Local demo · synthetic data".
5. Jarvis: ask "What should we reorder and how much?". Expect an `analyze_reorder` tool card with a
   result, then a streamed answer whose quantities and totals match the Replenish panel. Press
   **Stop** during a second question; it shows "Stopped".
6. Receive → new receipt → photo of a real handwritten note → Read with Pi agent. Expect editable
   lines, blank condition unless written, unknown values blank, and questions for anything unreadable.
   Then repeat with a blurred photo: expect an error and no lines.
7. Microphone on a receipt: speak "two dining chairs, six kilograms each". Expect a voice evidence
   card with audio and transcript. Repeat with Wi-Fi off: the recording is kept with "No transcript".
8. Edit measurements (try `6kg`, then `6`). Check the totals and warnings. Set the condition to Good,
   assign bays, tick checked, then **Post counted stock** twice. Stock rises once.
9. Ctrl+C, then `bun run demo` again (no `--reset`). Expect "Kept the existing local warehouse data",
   with the posted receipt and stock still there.
10. `pi` → `/logout` (or set a wrong `WAREORB_AGENT_MODEL`), then ask Jarvis. Expect
    "Agent not connected" with the setup steps. Log in again afterwards.

## Verification evidence (Claude Cloud, 24 October 2026)

Automated (no credentials, synthetic data):

- `bun run check`: 157 Bun tests and 61 Convex tests pass; both typechecks and the production build pass.
  The baseline before this work was 27 + 49.
- New coverage:
  - Isolation and URL checks, including every cloud selector and URL trick.
  - The demo runner with CLI/fetch/file spies: a cloud input causes zero writes, CLI runs or requests.
  - Node selection on Linux and Mac.
  - Measurement totals and input parsing.
  - The shared replenishment allocation, including the review's double-spend reproduction.
  - Pi SDK wiring with the mocked faux provider: tool allowlist, streaming, errors, busy, cancel,
    structured drafts and undecodable photos.
  - The HTTP routes over real loopback sockets, the SSE client parser, voice-note evidence and
    build/server refusals.
  - Convex mutations for voice evidence, unknown condition, measurements and the extraction bridge.
- `bun run test:browser` (Chromium harness, mocked provider): 11/11 checks.

Live (real provider via an Anthropic API key in the process environment; Pi subscription login **not** tested):

- An analyst turn on `anthropic/claude-sonnet-5-5` called `analyze_reorder`. Its answer matched the
  shared plan (12 units, RM5,100, 6 bays, RM3,700 and 16 bays left) and listed the SKUs without
  enough data. `WAREORB_E2E_LIVE=1 bun run test:browser` passed 11/11 with that answer rendered.
- Photo reading of a rendered, printed-style synthetic note:
  - Supplier, document number and three lines were read.
  - Measurements were read exactly (`pcs`, 2 packages, 90×60×45 cm, 6 kg per item).
  - The stated "carton corner damaged" was kept. The unstated condition stayed blank.
  - The smudged lamp quantity stayed unknown, with questions. The note's total weight was not
    assigned to a line.
- A blurred photo gave no lines, with the reason. An invalid key gave "The provider rejected the
  credentials (401 …)" with the setup steps.

Pending at the end of the Cloud run (see the Mac follow-up below):

- A real local Convex backend: the Cloud runner's egress proxy blocks the github.com binary
  download (HTTP 403).
- Full-app browser walkthrough and restart persistence on the real local database.
- Pi subscription login.
- Real handwriting and a real microphone with Chrome speech recognition.

Use the smoke test above for these.

## Mac follow-up acceptance (24 October 2026)

An isolated checkout of `265e810` was tested with a real accountless local Convex backend.
The original checkout, video work and cloud deployments were not changed. Ports 3230 (web),
3231 (Convex) and 3232 (HTTP actions) kept this run separate from the existing preview.

The first full-app launch exposed a blank page: `process is not defined`. The demo runner did not
provide `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY`, so Bun left the optional key's `process.env` references
in the browser bundle. The runner now explicitly supplies an empty public Clerk key. A regression
test builds the actual frontend with the runner's child environment and `.env` loading disabled;
it failed before the fix with that unresolved reference and passes afterwards. Hosted authentication
configuration is unchanged.

Fresh checks after the fix: **158 Bun tests and 61 Convex tests pass**, both typechecks pass, the
production build passes, and `git diff --check` passes. An independent reviewer also ran the
14 demo-runner tests and found no actionable issue.

Observed in the complete browser app against the real local database:

- No login screen; "Local demo · synthetic data" and the owner presenter are shown.
- The seeded warehouse contains 43 SKUs and 375 units.
- A new receipt (`MAC-ACCEPT-20261024`, local synthetic acceptance data) was entered manually:
  2 × `CHAIR-LUMA-0410`, 1 package measuring 90 × 60 × 45 cm, 6 kg per item, good condition,
  2 counted units allocated to A-3-03, and the checked confirmation.
- `6kg` is rejected with an explicit input error and disables saving; `6` produces **12 kg**
  and **0.243 m³**. Blank weight fields stay unknown. A future received time is rejected.
- Saving and posting succeeds; the receipt becomes Posted and inventory rises to **377**.
  The posted form has no post button, preventing another UI submission.
- After Ctrl+C and restarting without `--reset`, the runner reports keeping the existing data.
  The browser still shows 377 units and the posted receipt, measurements, allocation and audit history.
- Without Pi credentials, an actual chat request shows "Agent not connected" and setup instructions;
  it does not return a fabricated warehouse answer.

Still unverified on this Mac: a live Pi subscription/provider turn and its tool cards, real handwritten
photo extraction, and microphone recording/transcription. Pi was not logged in, and no credentials
were read or copied. Cloud's live Anthropic evidence above is separate from these remaining checks.
Duplicate-post idempotency remains covered by automated backend tests, not a repeated live HTTP post
in this walkthrough.
