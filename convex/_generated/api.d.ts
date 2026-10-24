/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as ai from "../ai.js";
import type * as aiData from "../aiData.js";
import type * as deals from "../deals.js";
import type * as http from "../http.js";
import type * as lalamove from "../lalamove.js";
import type * as ledger from "../ledger.js";
import type * as lib from "../lib.js";
import type * as limits from "../limits.js";
import type * as quotes from "../quotes.js";
import type * as receiving from "../receiving.js";
import type * as replenish from "../replenish.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  ai: typeof ai;
  aiData: typeof aiData;
  deals: typeof deals;
  http: typeof http;
  lalamove: typeof lalamove;
  ledger: typeof ledger;
  lib: typeof lib;
  limits: typeof limits;
  quotes: typeof quotes;
  receiving: typeof receiving;
  replenish: typeof replenish;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
