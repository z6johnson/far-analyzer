import pLimit from "p-limit";

/** Default fan-out for per-clause LLM calls. */
export const DEFAULT_CONCURRENCY = 4;

export function makeLimiter(concurrency = DEFAULT_CONCURRENCY) {
  return pLimit(concurrency);
}
