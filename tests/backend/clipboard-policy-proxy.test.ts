import assert from "node:assert/strict";
import http from "node:http";
import { it } from "node:test";
import { createClipboardPolicyProxy } from "../../scripts/clipboard-policy-proxy.mjs";

it("serves unchanged application responses with a real clipboard denial policy and rejects foreign requests", async () => {
  const received: string[] = [];
  const upstream = http.createServer((req, res) => {
    received.push(req.headers.origin ?? "");
    res.writeHead(200, { "content-type": "text/html" }).end("<p>合成页面</p>");
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (upstream.address() as { port: number }).port;
  const proxy = createClipboardPolicyProxy({ upstreamPort });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const port = (proxy.address() as { port: number }).port;
  try {
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(origin, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "<p>合成页面</p>");
    assert.equal(response.headers.get("permissions-policy"), "clipboard-read=(), clipboard-write=()");
    assert.deepEqual(received, [`http://127.0.0.1:${upstreamPort}`]);
    const foreignHeaders: Record<string, string>[] = [{ Origin: "https://example.invalid" }, { Host: "example.invalid" }, { "Sec-Fetch-Site": "cross-site" }];
    for (const headers of foreignHeaders) {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const request = http.get(origin, { headers }, response => {
          response.resume(); resolve(response.statusCode);
        });
        request.on("error", reject);
      });
      assert.equal(status, 403);
    }
    assert.equal(received.length, 1);
  } finally {
    await Promise.all([proxy, upstream].map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
    })));
  }
});
