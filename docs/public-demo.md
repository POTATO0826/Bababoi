# Public demo (no login)

Live: **https://wareorb-demo.vercel.app**

A hosted copy of the warehouse with synthetic data. Every visitor is signed in as the demo owner, so anyone with the link can change or reset the data. It never touches business data.

| Part | Where |
| --- | --- |
| Backend | Convex project `wareorb-demo`, production deployment `hidden-newt-834` |
| Site | Vercel project `wareorb-demo` (static files) |
| Sign-in | `POST https://hidden-newt-834.convex.site/demo/token` returns a 1-hour token for the demo owner |

Only deployments listed in `PUBLIC_DEMO_DEPLOYMENTS` (`src/domain/local-demo.ts`) serve that token or trust it. Everywhere else the route returns 404 and sign-in stays Clerk, whatever the environment variables say.

## Convex environment (`hidden-newt-834`)

| Variable | Purpose |
| --- | --- |
| `WAREORB_PUBLIC_DEMO_JWKS`, `WAREORB_PUBLIC_DEMO_PRIVATE_JWK` | The demo key pair (`generateDemoKeys` in `src/local/demo-identity.ts`) |
| `WAREORB_ALLOW_DEMO_SEED` | `true`: allows loading and resetting the synthetic data |
| `ANTHROPIC_API_KEY` (optional) | Claude for Jarvis and photo reading. Visitors spend it; rate limits apply. Without it, Jarvis uses keyword rules |
| `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET` (optional) | Sandbox quotes. Without them, quotes are labelled samples |

The demo owner was created once with `bunx convex run --prod access:bootstrapOwner '{"tokenIdentifier":"https://wareorb.public-demo|demo-visitor","email":"visitor@wareorb.demo","name":"Demo visitor"}'`.

## Redeploy

Run from a checkout whose `.env.local` points at the `wareorb-demo` Convex project.

```sh
bunx convex deploy -y                       # functions
bunx convex run --prod seed:run             # fresh synthetic data (or in the app: / → Reset demo data)

BUN_PUBLIC_CONVEX_URL=https://hidden-newt-834.convex.cloud \
BUN_PUBLIC_CONVEX_SITE_URL=https://hidden-newt-834.convex.site \
BUN_PUBLIC_WAREORB_PUBLIC_DEMO=1 \
bun scripts/build-production.ts             # site → dist/
```

Then upload `dist/` to the `wareorb-demo` Vercel project (`vercel deploy --prod` from a folder containing `dist/`'s files and a `vercel.json` that rewrites unknown paths to `/index.html`). The build refuses any other Convex deployment and any Clerk key.
