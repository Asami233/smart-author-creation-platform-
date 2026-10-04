"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { diagnosticsAllowed, editorDiagnostics, type EditorMetric } from "@/lib/client/editor-diagnostics";

const subscribe = () => () => {};
const enabled = () => diagnosticsAllowed(window.location);
const labels: Record<EditorMetric, string> = { serialize: "HTML 序列化", update: "onUpdate 同步处理",
  twoFrames: "beforeinput → 双帧回调", event: "编辑事件耗时（≥16ms）", longTask: "页面长任务（≥50ms）" };
const number = (value: number | null) => value === null ? "—" : value.toFixed(2);

export function EditorDiagnostics() {
  const allowed = useSyncExternalStore(subscribe, enabled, () => false);
  return allowed ? <DiagnosticsPanel /> : null;
}

function DiagnosticsPanel() {
  const [snapshot, setSnapshot] = useState(() => editorDiagnostics.snapshot());
  const [heap, setHeap] = useState<number | null>(null);
  const [baselineHeap, setBaselineHeap] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (closed) return;
    editorDiagnostics.start();
    const frames = new Set<number>();
    const observers: PerformanceObserver[] = [];
    const onInput = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[aria-label="章节正文编辑器"]') ||
          document.visibilityState !== "visible") return;
      const start = performance.now();
      const first = requestAnimationFrame(() => {
        frames.delete(first);
        const second = requestAnimationFrame(() => {
          frames.delete(second);
          if (document.visibilityState === "visible") editorDiagnostics.record("twoFrames", performance.now() - start);
        });
        frames.add(second);
      });
      frames.add(first);
    };
    document.addEventListener("beforeinput", onInput, true);
    if (typeof PerformanceObserver !== "undefined") {
      for (const type of ["event", "longtask"]) {
        if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (type === "longtask") editorDiagnostics.record("longTask", entry.duration);
            else {
              const target = (entry as PerformanceEventTiming).target;
              if (["keydown", "keyup", "beforeinput", "input"].includes(entry.name) && target instanceof Element &&
                  target.closest('[aria-label="章节正文编辑器"]')) editorDiagnostics.record("event", entry.duration);
            }
          }
        });
        try { observer.observe({ type, durationThreshold: 16 } as PerformanceObserverInit); observers.push(observer); }
        catch { observer.disconnect(); }
      }
    }
    return () => {
      document.removeEventListener("beforeinput", onInput, true);
      frames.forEach(cancelAnimationFrame);
      observers.forEach(observer => observer.disconnect());
      editorDiagnostics.stop();
    };
  }, [closed]);

  if (closed) return null;
  function capture() {
    setSnapshot(editorDiagnostics.snapshot());
    const value = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const mb = typeof value === "number" && Number.isFinite(value) ? value / 1048576 : null;
    setHeap(mb);
    setBaselineHeap(previous => previous ?? mb);
  }
  return <details className="fixed bottom-12 right-3 z-50 max-w-[min(600px,95vw)] rounded-lg border bg-white p-3 text-xs shadow-lg" open>
    <summary className="cursor-pointer font-semibold">本地编辑器诊断（不上传）</summary>
    <p className="my-2">仅最近 200 样本；双帧是近似值，不是 INP。采样含工具与面板开销。</p>
    <table aria-label="编辑器性能样本" className="w-full text-left">
      <thead><tr><th>指标 / ms</th><th>N</th><th>P50</th><th>P95</th><th>最大</th></tr></thead>
      <tbody>{snapshot.map(row => <tr key={row.key}><th>{labels[row.key]}</th><td>{row.count}</td>
        <td>{number(row.p50)}</td><td>{number(row.p95)}</td><td>{number(row.max)}</td></tr>)}</tbody>
    </table>
    <p className="mt-2">JS 堆估计：{number(heap)} MiB；相对首次采样：{number(heap !== null && baselineHeap !== null ? heap - baselineHeap : null)} MiB</p>
    <p>堆 API 非标准且不精确；缺失显示 —，不代表 0。无样本不代表无延迟。</p>
    <div className="mt-2 flex gap-3">
      <button type="button" className="rounded border px-2 py-1" onClick={capture}>采样 / 刷新诊断</button>
      <button type="button" className="rounded border px-2 py-1" onClick={() => { editorDiagnostics.start(); setSnapshot(editorDiagnostics.snapshot()); setBaselineHeap(null); setHeap(null); }}>清空样本</button>
      <button type="button" className="rounded border px-2 py-1" onClick={() => setClosed(true)}>停止诊断</button>
    </div>
  </details>;
}
