import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { it } from "node:test";
import { createChapterFaultProxy } from "../../scripts/chapter-fault-proxy.mjs";

it("fault lab is target-scoped, one-shot, and drops responses only after upstream completion", async () => {
  const chapterId = "00000000-0000-4000-8000-000000000001";
  let commits = 0;
  const upstream = http.createServer((req, res) => {
    req.resume(); req.on("end", () => { if (req.method === "PATCH") commits++;
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ commits })); });
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = createChapterFaultProxy({ chapterId, upstreamPort: (upstream.address() as AddressInfo).port, delayMs: 10, bodyDelayMs: 100 });
  await new Promise<void>(resolve => proxy.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(proxy.server.address() as AddressInfo).port}`;
  const url = `${origin}/api/chapters/${chapterId}`;
  try {
    assert.equal((await fetch(url, { headers: { Origin: "https://example.com" } })).status, 403);
    proxy.arm("drop-save-response");
    assert.equal((await fetch(`${origin}/api/health`)).status, 200);
    await assert.rejects(async () => {
      const response = await fetch(url, { method: "PATCH", body: "{}", headers: { Origin: origin } });
      await response.json();
    });
    assert.equal(commits, 1);
    assert.equal((await fetch(url, { method: "PATCH", body: "{}", headers: { Origin: origin } })).status, 200);
    assert.equal(commits, 2);
    proxy.arm("hang-save");
    await assert.rejects(fetch(url, { method: "PATCH", signal: AbortSignal.timeout(30) }));
    assert.equal(commits, 2);
    proxy.arm("slow-save-body");
    const controller = new AbortController();
    const slow = await fetch(url, { method: "PATCH", body: "{}", signal: controller.signal });
    assert.equal(slow.status, 200, "headers arrive before the body stalls");
    const body = slow.json();
    controller.abort();
    await assert.rejects(body);
    assert.equal(commits, 3, "the upstream write completed before the body was canceled");
    proxy.arm("delay-read");
    assert.equal((await fetch(url)).status, 200);
    assert.throws(() => proxy.arm("bad"));
  } finally {
    proxy.server.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => proxy.server.close(() => resolve())),
      new Promise<void>(resolve => upstream.close(() => resolve()))]);
  }
});
