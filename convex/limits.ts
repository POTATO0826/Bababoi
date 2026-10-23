import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

// One limiter shared by every user of these credentials. Lalamove sandbox allows 30 quotations/min; stay under it.
export const limiter = new RateLimiter(components.rateLimiter, {
  lalamoveQuote: { kind: "token bucket", rate: 25, period: MINUTE, capacity: 6 },
  lalamoveCities: { kind: "fixed window", rate: 20, period: MINUTE },
  fish: { kind: "token bucket", rate: 40, period: MINUTE, capacity: 10 },
  claude: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
});
