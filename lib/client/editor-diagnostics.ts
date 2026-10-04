export const DIAGNOSTIC_SAMPLE_LIMIT = 200;
export type EditorMetric = "serialize" | "update" | "twoFrames" | "event" | "longTask";
const keys: EditorMetric[] = ["serialize", "update", "twoFrames", "event", "longTask"];

export function diagnosticsAllowed(location: { hostname: string; search: string }) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("editorDiagnostics") === "1";
}

export function summarizeSamples(values: readonly number[]) {
  if (!values.length) return { count: 0, p50: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1],
    p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1)! };
}

export function createEditorDiagnostics() {
  let enabled = false;
  const samples = new Map<EditorMetric, number[]>();
  return {
    start() { enabled = true; samples.clear(); },
    stop() { enabled = false; samples.clear(); },
    record(key: EditorMetric, duration: number) {
      if (!enabled || !Number.isFinite(duration) || duration < 0) return;
      const values = samples.get(key) ?? [];
      if (values.length === DIAGNOSTIC_SAMPLE_LIMIT) values.shift();
      values.push(duration);
      samples.set(key, values);
    },
    measure<T>(key: EditorMetric, operation: () => T): T {
      if (!enabled) return operation();
      const start = performance.now();
      try { return operation(); } finally { this.record(key, performance.now() - start); }
    },
    snapshot() { return keys.map(key => ({ key, ...summarizeSamples(samples.get(key) ?? []) })); },
  };
}

// Window-local, numerical, bounded, opt-in; never contains chapter IDs/text or keys.
export const editorDiagnostics = createEditorDiagnostics();
