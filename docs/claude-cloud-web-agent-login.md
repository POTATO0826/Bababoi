# Claude Cloud task: connect and disconnect the agent from the web app

## Execute this task

Implement and verify the feature below in this repository. The user wants working code, not another
plan or terminal-setup guide. Work from `backend-production`, preserve the latest changes, and push
your completed commits back to that branch. Do not deploy to a public website.

Repository: `https://github.com/POTATO0826/Bababoi`

Verified starting point: `40908742d6001234c2493242b9d8e79acd07ff03` (`4090874`). Fetch the remote
branch first and inspect any newer commits before working. Read `AGENTS.md` and `docs/local-demo.md`.
If you change Convex code, first read `convex/_generated/ai/guidelines.md` as required by `AGENTS.md`.

## What the user actually wants

The user has a Claude API key. They do not want to open a terminal, run `pi`, use Pi's `/login`,
export environment variables, or restart the app just to connect the warehouse assistant.

They want **`/login` inside the webpage's existing Jarvis command menu**. It opens a small form for
their Claude API key. After successful connection, show the connected state and **`/logout`**
(with an obvious Log out action). Logging out must really disconnect this app's agent.

This is a local warehouse presentation app. The warehouse itself still opens without an account
or sign-in screen. This feature connects the AI provider; it does not introduce staff registration
or a mandatory app login. Manual warehouse operations must keep working while the agent is disconnected.

## Required user experience

1. In Jarvis, typing `/` suggests `/login` when disconnected. Typing `/login` and pressing Enter,
   or selecting the suggestion, opens the same connection form. Add a visible **Log in** button
   next to the disconnected status so the feature is discoverable without knowing the command.
2. The form follows the existing dark UI and supports keyboard use, labels, focus management,
   cancellation and an accessible error message. Default provider: **Anthropic / Claude API key**.
   The key goes into a masked password input, never into the normal chat composer.
3. Submitting displays a busy state and checks the credential on the local server using the installed
   provider SDK. Use the smallest reliable authentication/model-access check available; keep requests
   bounded by a timeout. A nonempty string alone is not a successful login. Wrong/revoked keys,
   unavailable models and network failures produce clear, recoverable errors.
4. On success, close the form, erase its key value, and show **Connected · Claude** with the actual
   provider/model. Jarvis chat and receipt reading both use this newly connected provider immediately.
   A page refresh while the local server is still running retains the connection.
5. While connected, the menu offers `/logout` and the status area offers **Log out**. Either action
   disconnects the agent, updates the UI, cancels outstanding agent work, and retires conversations
   that still hold the old credential. A later chat or extraction request must not keep using it.
6. After logout, show the Log in action again. Reconnecting with a different key creates fresh
   agent sessions. Cancelling a replacement login or receiving an invalid replacement key leaves
   an existing valid connection intact.
7. `/login` and `/logout` are local UI commands, not prompts sent to an LLM. Keep all existing
   warehouse commands (`/receive`, `/ageing`, `/deals`, `/delivery`, `/approve`, `/collect`,
   `/replenish`) working with their current role restrictions and keyboard navigation.
8. Replace the current user-facing terminal instructions with a short explanation and the web Log in
   action. The warehouse presenter should not have to interpret `pi`, environment variables or
   `bun run demo` messages to connect the assistant. Keep useful diagnostics in developer docs.

## Credential lifecycle and scope

Use these implementation defaults unless the repository reveals a concrete incompatibility; explain
any necessary deviation in your final report:

- Store the web-supplied key only in the local server's memory for this run. A browser refresh does
  not log out; stopping/restarting the server does. Mention this briefly in the connection form.
  Do not add a "remember forever" option in this pass.
- Do not put keys in browser storage, URLs, transcripts, tool arguments/results, analytics,
  console output, API responses, committed files, Convex data/environment, or the browser bundle.
  Clear the password field on success, cancellation and dialog unmount. Do not echo raw credentials
  in provider error messages.
- Use a same-origin POST body from the form to the loopback server. Apply the existing local Host,
  Origin and content-type protections, request-size limits and no-store responses to auth routes.
  Accept the exact app origin, not merely a hostname match. Auth routes must not exist in hosted mode.
- The new connection is **app-scoped**. Do not overwrite/delete the operator's shared Pi credentials
  or environment settings. Existing preconfigured Pi/environment authentication may still work before
  an explicit web choice; after an explicit web logout, do not silently reconnect via those fallbacks.
  A successful web login takes precedence over any preconfigured provider, including Codex.
- Serialize or version credential changes: a slow login must not reconnect after logout; concurrent
  login attempts must not restore stale state. Prevent old chat/extraction sessions from surviving
  a successful provider switch. The frontend must also ignore stale status/stream responses after logout.
- The first pass targets the official Anthropic API. Do not invent a third-party Base URL or copy
  credentials from another project. If the user later supplies a proxy endpoint, that can be configured
  explicitly in a separate follow-up.

## Current code and integration points

Inspect these files before choosing the smallest coherent implementation:

- `src/components/jarvis/jarvis-chat.tsx`: slash-menu suggestions, command selection, agent status
  and chat UI. A shared `Dialog` and `Input` already exist under `src/components/ui/`.
- `src/commands.ts`: workflow-only command IDs are currently derived from `Stage`. Agent auth is
  not a warehouse workflow stage; avoid adding fake warehouse panels just to make the types fit.
- `src/actions.ts`: `runCommand`, `slashCommand`, `refreshLocalAgent`, chat cancellation and session IDs.
  Currently `runCommand` adds text to the transcript before dispatching slash commands; ensure key
  submission never follows that path. A credential entered accidentally after `/login` must not be
  recorded or forwarded to an LLM; show the masked form instead.
- `src/store.ts`: current `LocalAgentState`, transcript and UI state. Keep secrets out of this store.
- `src/local/agent-client.ts`: browser status/chat transport; extend with typed auth transport as needed.
- `src/local/routes.ts`: local-only routes and origin checks. Extend the injectable `AgentOps` boundary
  so route behavior can be tested without real credentials.
- `src/local/agent.ts`: Pi `ModelRuntime`, provider selection, sessions and extraction. The installed
  Pi SDK supports in-memory auth and runtime API keys; inspect its actual types/behavior before use.
  Its ordinary file-backed login/logout would affect shared Pi credentials and is unsuitable here.
- `src/local/demo-runner.ts`: preserve the fix that explicitly provides an empty
  `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY`. Removing it brings back a full-app blank page.

Keep the existing read-only agent tool allowlist, deterministic replenishment plan, human confirmation
before posting stock, evidence retention, measurement validation and local/cloud isolation.

## Verification and acceptance

Add meaningful automated tests for real boundary behavior, including:

- Valid login, invalid key, timeout/network error, and failure without leaking the submitted key.
- Rejected cross-origin/missing-origin mutations, wrong Host/content type, oversized bodies, and
  auth routes absent in hosted mode. Test protocol and port as well as hostname.
- Web login overrides ambient/Pi fallback; refresh reports connected; logout truly disables both
  chat and extraction, clears/aborts old sessions, and does not mutate shared Pi auth.
- Logout during a pending login, concurrent/replacement login, and late status/stream responses.
- `/login` and `/logout` work through mouse selection and Enter; secret values never enter chat
  history; cancelling and reconnecting work; ordinary workflow commands still behave correctly.

Run `bun install --frozen-lockfile` and `bun run check`. At the reviewed starting point this passes
**158 Bun tests + 61 Convex tests**, both typechecks and the production build. Add coverage rather
than deleting or weakening existing tests.

Also exercise the complete web app, not only isolated UI components. `265e810` passed its component
harness but failed a real Mac launch with `process is not defined`; `4090874` fixes that and adds an
actual-frontend bundle regression. Keep this regression passing.

Use labelled mocked credentials/providers for automated browser checks. Do not add a production
backdoor, scripted warehouse reply or fake "connected" status to make the demo appear complete.
If the Cloud environment cannot download/start the local Convex backend, use the available harness,
report that precise limitation, and leave a short Mac acceptance checklist. Do not claim live provider
success unless an authorized credential was actually available in the execution environment and the
request succeeded. Never request that the user paste a secret into the task conversation.

Manual acceptance on the presentation Mac:

1. Open the warehouse with no app account prompt; disconnected Jarvis has Log in and `/login`.
2. Enter an invalid key in the masked form: show a useful error and remain disconnected.
3. Enter the user's valid key directly in the form: show connected provider/model with no restart.
4. Ask for replenishment advice: show real tool calls/results and a grounded streamed answer.
   Receipt reading also uses the chosen Claude provider.
5. Refresh: still connected. Run `/logout`: now disconnected; subsequent AI requests cannot use
   the previous connection, while manual warehouse operations continue.
6. Reconnect through the form and verify another real request. Stop/restart the server: return to
   disconnected unless a separate preconfigured provider was already present; never restore the
   web-entered key from disk or the browser.

## Delivery

Update `docs/local-demo.md` with web connection instructions, credential lifetime and honest evidence.
Commit only explicit relevant source/test/doc files, check the staged diff for credentials, and push
to `origin/backend-production` without force pushing. Do not touch video assets or other checkouts.
Do not reset the user's local warehouse data or change public cloud deployments.

Your final response must give the pushed commit, what now works, test results, and any remaining
live checks. The user should then only need to pull the branch, start the existing demo, and enter
their key through the webpage.
