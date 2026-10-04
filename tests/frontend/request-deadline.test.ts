import assert from "node:assert/strict";
import { it } from "node:test";
import { withRequestDeadline, RequestDeadlineError } from "../../lib/client/request-deadline";

it("returns successful results and clears the deadline without aborting them", async () => {
  let signal: AbortSignal | undefined;
  assert.equal(await withRequestDeadline(async current => { signal = current; return 42; }, 5), 42);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(signal?.aborted, false);
});
it("preserves ordinary failures", async () => {
  const error = new Error("network");
  await assert.rejects(withRequestDeadline(async () => { throw error; }), value => value === error);
});
it("releases a hanging request and aborts its transport", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(withRequestDeadline(current => { signal = current; return new Promise(() => {}); }, 5), RequestDeadlineError);
  assert.equal(signal?.aborted, true);
});
it("keeps the deadline active while reading a delayed body and ignores late completion", async () => {
  let finish: ((value: string) => void) | undefined;
  await assert.rejects(withRequestDeadline(async () => {
    await Promise.resolve();
    return new Promise<string>(resolve => { finish = resolve; });
  }, 5), RequestDeadlineError);
  finish?.("late success");
});
