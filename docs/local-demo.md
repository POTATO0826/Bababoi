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

## Connecting the agent from the web page (/login)

The warehouse opens without any account. Only the AI assistant needs a provider:

1. In Jarvis, click **Log in** (next to "Agent not connected"), or type `/login` and press Enter.
2. Paste the **Claude API key** into the masked field and press **Log in**. The server checks the key
   with Anthropic (a model-metadata request, 15-second limit) before using it.
3. Jarvis shows **Connected · Claude** with the model (`anthropic/claude-sonnet-5-5` by default).
   Chat and receipt photo reading use it immediately; no restart.
4. **Log out** (status bar) or `/logout` disconnects at once. Answers and photo readings still running
   are stopped, and their conversations are retired. Later requests cannot use the old key, and no
   preconfigured provider is used until you log in again.

Credential lifetime and handling:

- The key is kept **only in the WareOrb server's memory** for this run, in an app-scoped Pi runtime.
  A page refresh keeps the connection. Stopping or restarting `bun run demo` forgets it.
- It is never written to disk, `.env.local`, Pi's shared `~/.pi/agent/auth.json`, the browser
  (no storage, URL or bundle), the chat transcript, tool calls, logs, Convex data or API responses.
  Provider errors are redacted.
- The field is a password input; its value is cleared on success, cancel and close.
- `/login sk-…` typed into the chat opens the masked form, and the typed text is neither recorded nor
  sent. A key pasted into the chat by mistake is refused the same way.
- A wrong or revoked key, an unavailable model, a timeout or a network failure shows a clear error.
  An existing connection stays as it was. Logging in with a different key replaces the connection
  and starts fresh agent sessions. A logout during a pending login wins.
- The login and logout routes accept only a same-origin JSON POST from this exact page
  (`http://127.0.0.1:<port>` or `http://localhost:<port>`, matching the Host). They are size-limited
  and `no-store`, and do not exist outside local demo mode.

Developer fallback (optional, no web step): before any web login or logout, a provider already
configured on this computer is used. That means Pi's own login (`pi` → `/login`, stored in
`~/.pi/agent/auth.json`) or `ANTHROPIC_API_KEY` exported in the shell that runs `bun run demo`. The
order is `openai-codex/gpt-6.1-sol`, then `anthropic/claude-sonnet-5-5`; override with
`WAREORB_AGENT_MODEL`. A web login always takes precedence, and an explicit web logout disables the
fallback until the next web login. Logging out in the app never changes Pi's shared credentials.
Without any connection, manual warehouse work still works, and Jarvis shows **Agent not connected**
with a Log in button, never a scripted answer.

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
| Jarvis: "Agent not connected" | Click **Log in** (or `/login`) and enter a Claude API key |
| Login: "Claude rejected this API key" | The key is wrong or revoked; create a new key in the Anthropic console |
| Login: "Checking the key timed out" / "Could not reach api.anthropic.com" | Check the internet connection, then try again |
| Jarvis: "The provider rejected the credentials" | The key was revoked meanwhile: **Log out**, then **Log in** with a valid key |
| Connected before, disconnected after restarting the demo | Expected: web-entered keys live only in server memory; log in again |
| Voice note says "No transcript" | Use Chrome, allow the microphone, check the internet; the recording is kept anyway |

## Tests

```sh
bun run check            # unit + Convex tests, both typechecks, production build
bun run test:browser     # Chromium harness: Jarvis streaming + measurements (needs Playwright)
```

Agent tests use Pi's scripted **faux provider** and say so ("mocked provider"). They prove the
wiring, not a live model. The browser test starts disconnected and drives the real Jarvis UI:
`/login` by Enter and by mouse, the masked form, a wrong key, cancel, connect, a streamed tool answer,
the `/login <key>` and pasted-key guards, `/logout`, a refused question after logout, `/replenish`,
reconnect, refresh, and the complete app bundle booting in demo mode. It uses a mocked key check and
the mocked provider. `WAREORB_E2E_LIVE=1 WAREORB_E2E_CLAUDE_KEY=… bun run test:browser` repeats it with
a real key typed into the form and checked by Anthropic (synthetic data only; the key stays in that
shell's environment).

## Presentation-Mac smoke test (live checks)

Run these in order on the presentation Mac. No terminal login is needed; the key is entered in the page.

1. `bun install --frozen-lockfile && bun run check` — all green.
2. `bun run demo:reset`. Expect `Loaded/Reloaded the synthetic demo data` and an `Agent …` line.
3. `curl -s -H 'Origin: https://evil.example' http://127.0.0.1:3000/api/demo/token` is refused (403).
4. Open http://127.0.0.1:3000 in Chrome. Check there is no app login screen and the header shows
   "Local demo · synthetic data". Jarvis shows **Agent not connected** with **Log in**, and `/`
   suggests `/login` (unless a developer fallback provider is configured).
4a. **Log in** → enter a wrong key: a clear error, still disconnected. Then enter your Claude API key:
   **Connected · Claude** with `anthropic/claude-sonnet-5-5`, no restart.
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
10. Refresh the page: still connected. Run `/logout`: **Agent not connected**. A question is now
    refused (no old key, no fallback); manual receiving and Replenish still work. Log in again through
    the form and ask once more. Stop and restart the demo: disconnected again (the key is never restored
    from disk or the browser), unless a developer fallback provider is configured.

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

## Web agent login/logout (Claude Cloud, 24 October 2026)

`/login`, the masked Claude API key form, **Connected · Claude** status, and `/logout` / **Log out**
are implemented in Jarvis (`docs/claude-cloud-web-agent-login.md`). The warehouse itself remains accountless.

Automated (mocked key check and labelled mocked providers; no real credential):

- `bun run check` passes: **172 Bun tests and 61 Convex tests**, both typechecks and the production
  build. The starting point was 158 + 61.
- `src/local/web-login.test.ts` covers:
  - Valid login, taking precedence over a preconfigured provider; refresh stays connected.
  - Wrong, malformed, erroring and timed-out keys, with redaction (the key never appears in results).
  - An invalid or cancelled replacement keeps the current connection; a new key gives fresh sessions.
  - Logout disables chat and photo reading without falling back to a preconfigured provider.
  - Logout stops an answer or photo reading in progress.
  - A logout during a pending login wins; concurrent logins never restore an older one.
  - Pi's shared `auth.json` is byte-for-byte unchanged, and no files are written.
- `src/local/routes.test.ts` checks the login and logout routes over real loopback HTTP:
  - They refuse a foreign origin, the wrong protocol, the wrong port, a lookalike host, an origin
    that doesn't match the Host, a missing Origin, the wrong content type, an oversized body and a
    non-Claude provider.
  - Responses are `no-store` and never contain the key. After logout, chat is refused.
- `src/local/config.test.ts` covers both server modes. The real server in hosted mode returns 404
  for the agent and auth routes. In demo mode it serves them with origin and format checks.
- `bun run test:browser` passes all 32 checks: the full Jarvis login, logout and command flow
  described under Tests, plus the measurement checks. The complete app bundle boots in demo mode.

Live (a Claude API key the user authorised earlier in this conversation, set only in each command's
environment; synthetic data only):

- `WAREORB_E2E_LIVE=1 bun run test:browser` passes all 32 checks:
  - A wrong key typed into the real form was rejected by Anthropic and shown as "Claude rejected this
    API key".
  - The real key connected as **Connected · Claude** (`anthropic/claude-sonnet-5-5`).
  - A real `analyze_reorder` tool call and a streamed answer were rendered.
  - Logout refused the next question, and reconnect plus refresh stayed connected.
- Receipt photo reading via the web login read 3 lines from the synthetic note. After logout the same
  reading was refused with "The agent is logged out".
- Real demo web server (`src/index.ts`, demo mode): after a login over HTTP, status showed
  `connection: "web"`. After stopping and starting the server, status was `connection: "none"`.

Pending on the presentation Mac:

- The complete app against a real local Convex backend: Cloud's proxy blocks the backend binary
  download, so the browser test uses the component harness plus a full-app boot check.
- Logging in with the user's own key in Chrome, and receipt reading of a real handwritten photo
  after a web login.
- Run steps 4–10 of the smoke test above.
