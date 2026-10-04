/** Test-only loopback proxy for a real browser clipboard policy rejection. */
import http from "node:http";
import { pathToFileURL } from "node:url";

export function createClipboardPolicyProxy({ upstreamPort = 5179 } = {}) {
  if (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) throw new Error("Invalid upstream port.");
  return http.createServer((req, res) => {
    const port = res.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host) || !req.url?.startsWith("/") || req.url.startsWith("//") ||
        req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && !hosts.some(host => req.headers.origin === `http://${host}`))) {
      req.resume(); res.writeHead(403).end(); return;
    }
    const headers = { ...req.headers, host: `127.0.0.1:${upstreamPort}` };
    if (headers.origin) headers.origin = `http://127.0.0.1:${upstreamPort}`;
    const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort,
      path: req.url, method: req.method, headers }, response => {
      res.writeHead(response.statusCode ?? 502, { ...response.headers,
        "permissions-policy": "clipboard-read=(), clipboard-write=()" });
      response.on("error", () => res.destroy());
      response.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.CLIPBOARD_PROXY_PORT ?? 5181);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid proxy port.");
  const server = createClipboardPolicyProxy({ upstreamPort: Number(process.env.CLIPBOARD_UPSTREAM_PORT ?? 5179) });
  server.listen(port, "127.0.0.1", () => process.stdout.write(`Clipboard policy test: http://127.0.0.1:${port}\n`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    server.close(); server.closeAllConnections();
  });
}
