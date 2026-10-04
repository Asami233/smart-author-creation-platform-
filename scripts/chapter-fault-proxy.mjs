/** Test-only loopback proxy. Never point it at the daily database/server. */
import http from "node:http";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";

const modes = new Set(["none", "hang-read", "hang-save", "delay-read", "delay-save", "slow-save-body", "drop-save-response"]);
export function createChapterFaultProxy({ chapterId, upstreamPort = 5178, delayMs = 12_000, bodyDelayMs = 18_000, log = () => {} }) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(chapterId)) throw new Error("An explicit synthetic chapter UUID is required.");
  const chapterPath = `/api/chapters/${chapterId}`;
  let armed = "none";
  const server = http.createServer((req, res) => {
    const port = server.address().port;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(req.headers.host) || !req.url?.startsWith("/") || req.url.startsWith("//") ||
        req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && !allowedHosts.some(host => req.headers.origin === `http://${host}`))) {
      res.writeHead(403).end(); return;
    }
    const target = new URL(req.url, "http://127.0.0.1");
    const isRead = req.method === "GET";
    const isSave = req.method === "PATCH";
    const matches = target.pathname === chapterPath &&
      ((isRead && armed.endsWith("read")) || (isSave && (armed.endsWith("save") || armed === "slow-save-body" || armed === "drop-save-response")));
    const fault = matches ? armed : "none";
    if (matches) { armed = "none"; log(`triggered ${fault}`); }
    if (fault.startsWith("hang-")) {
      req.resume(); // Explicitly do not forward this request.
      const timer = setTimeout(() => res.writeHead(504).end(), 120_000);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    const headers = { ...req.headers, host: `127.0.0.1:${upstreamPort}` };
    if (headers.origin) headers.origin = `http://127.0.0.1:${upstreamPort}`;
    const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort,
      path: req.url, method: req.method, headers }, response => {
      if (fault === "drop-save-response") {
        response.resume();
        response.on("end", () => {
          log(`upstream completed ${response.statusCode}; response body truncated`);
          // Deliver headers first so browsers cannot silently retry a connection
          // closed before any response. The successful JSON body is incomplete.
          res.writeHead(response.statusCode ?? 200, { "Content-Type": "application/json", "Content-Length": "32" });
          res.write('{"data":');
          const timer = setTimeout(() => res.destroy(), 50);
          res.on("close", () => clearTimeout(timer));
        });
      } else if (fault === "slow-save-body") {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          const responseHeaders = { ...response.headers, "content-length": String(body.length) };
          delete responseHeaders["transfer-encoding"];
          log(`upstream completed ${response.statusCode}; response body delayed ${bodyDelayMs} ms`);
          res.writeHead(response.statusCode ?? 502, responseHeaders);
          res.write(body.subarray(0, 1));
          const timer = setTimeout(() => { if (!res.destroyed) res.end(body.subarray(1)); }, bodyDelayMs);
          res.on("close", () => clearTimeout(timer));
        });
      } else if (fault.startsWith("delay-")) {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => {
          log(`upstream completed ${response.statusCode}; response delayed ${delayMs} ms`);
          const timer = setTimeout(() => {
            if (!res.destroyed) { res.writeHead(response.statusCode ?? 502, response.headers); res.end(Buffer.concat(chunks)); }
          }, delayMs);
          res.on("close", () => clearTimeout(timer));
        });
      } else {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      }
      response.on("error", () => res.destroy());
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });
  return { server, arm(mode) {
    if (!modes.has(mode)) throw new Error("Unknown fault mode.");
    armed = mode; log(`armed ${mode}`);
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const proxy = createChapterFaultProxy({ chapterId: process.argv[2], log: console.log });
  proxy.server.listen(5179, "127.0.0.1", () => console.log("Fault lab http://127.0.0.1:5179 -> isolated :5178; type one fault mode to arm once."));
  createInterface({ input: process.stdin }).on("line", line => {
    try { proxy.arm(line.trim()); } catch { console.error("Modes:", [...modes].join(", ")); }
  });
}
