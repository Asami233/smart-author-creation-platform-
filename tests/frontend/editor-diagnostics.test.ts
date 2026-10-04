import assert from "node:assert/strict";
import { it } from "node:test";
import { createEditorDiagnostics, diagnosticsAllowed, summarizeSamples } from "../../lib/client/editor-diagnostics";

it("requires both loopback host and explicit opt-in", () => {
  assert.equal(diagnosticsAllowed({ hostname: "127.0.0.1", search: "?editorDiagnostics=1" }), true);
  assert.equal(diagnosticsAllowed({ hostname: "example.com", search: "?editorDiagnostics=1" }), false);
  assert.equal(diagnosticsAllowed({ hostname: "localhost", search: "" }), false);
});
it("bounds samples, rejects invalid durations and clears all numbers when stopped", () => {
  const diagnostics = createEditorDiagnostics();
  diagnostics.record("update", 12);
  assert.equal(diagnostics.snapshot()[1].count, 0);
  diagnostics.start();
  for (let i = 0; i < 300; i++) diagnostics.record("update", i);
  diagnostics.record("update", NaN); diagnostics.record("update", -1);
  assert.deepEqual(diagnostics.snapshot()[1], { key: "update", count: 200, p50: 199, p95: 289, max: 299 });
  diagnostics.stop();
  assert.equal(diagnostics.snapshot()[1].count, 0);
});
it("reports absence as null, uses nearest-rank percentiles, and does not alter operations", () => {
  assert.deepEqual(summarizeSamples([]), { count: 0, p50: null, p95: null, max: null });
  assert.deepEqual(summarizeSamples([3, 1, 2]), { count: 3, p50: 2, p95: 3, max: 3 });
  const diagnostics = createEditorDiagnostics(); diagnostics.start();
  assert.equal(diagnostics.measure("serialize", () => "result"), "result");
  assert.throws(() => diagnostics.measure("serialize", () => { throw new Error("test"); }), /test/);
  assert.equal(diagnostics.snapshot()[0].count, 2);
});
