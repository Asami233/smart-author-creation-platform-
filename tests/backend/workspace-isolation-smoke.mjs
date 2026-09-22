import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://localhost:5173");
assert.ok(["localhost", "127.0.0.1"].includes(baseUrl.hostname), "此测试只能连接本地开发服务器");

const nonce = crypto.randomUUID().replaceAll("-", "");
const emails = [`stage1-smoke-a-${nonce}@example.test`, `stage1-smoke-b-${nonce}@example.test`];
const userIds = [];

async function request(method, path, body, cookie) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: response.status === 204 ? null : await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

function data(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.payload));
  return result.payload.data;
}

async function register(email, penName) {
  const started = data(await request("POST", "/api/auth/register/start", {
    email,
    penName,
    password: `Stage1Smoke${nonce.slice(0, 14)}`,
  }), 202);
  assert.match(started.devCode ?? "", /^\d{6}$/, "仅支持本地开发验证码；不发送真实邮件");
  const verified = await request("POST", "/api/auth/register/verify", { email, code: started.devCode });
  const { user } = data(verified, 201);
  assert.match(user.id, /^[0-9a-f-]{36}$/i);
  assert.ok(verified.cookie, "注册响应应设置会话 Cookie");
  userIds.push(user.id);
  return verified.cookie;
}

function cleanupLocalAccounts() {
  const quotedIds = userIds.map((id) => {
    assert.match(id, /^[0-9a-f-]{36}$/i);
    return `'${id}'`;
  });
  const quotedEmails = emails.map((email) => `'${email}'`);
  const sql = [
    ...(quotedIds.length ? [
      `DELETE FROM works WHERE owner_id IN (${quotedIds.join(",")})`,
      `DELETE FROM workspace_preferences WHERE owner_id IN (${quotedIds.join(",")})`,
    ] : []),
    `DELETE FROM auth_challenges WHERE email IN (${quotedEmails.join(",")})`,
    ...(quotedIds.length ? [`DELETE FROM auth_users WHERE id IN (${quotedIds.join(",")})`] : []),
  ].join("; ");
  execFileSync(process.execPath, [
    "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--local", "--config", "./dist/server/wrangler.json",
    "--persist-to", ".wrangler/state", "--command", sql,
  ], { cwd: new URL("../../", import.meta.url), stdio: "pipe" });
}

try {
  const [cookieA, cookieB] = await Promise.all([
    register(emails[0], "测试作者甲"),
    register(emails[1], "测试作者乙"),
  ]);
  const create = (cookie, title) => request("POST", "/api/works", {
    title, description: "本地隔离回归测试", genre: "玄幻", targetWords: 100000,
  }, cookie);
  const a1 = data(await create(cookieA, "甲的作品一"), 201);
  const a2 = data(await create(cookieA, "甲的作品二"), 201);
  const b1 = data(await create(cookieB, "乙的作品"), 201);

  const a1WorkId = a1.work.id;
  const a1ChapterId = a1.chapters[0].id;
  const a2ChapterId = a2.chapters[0].id;
  const a2VolumeId = a2.volumes[0].id;
  const bWorkId = b1.work.id;
  const bChapterId = b1.chapters[0].id;

  assert.equal((await request("GET", `/api/works/${bWorkId}`, undefined, cookieA)).status, 404);
  assert.equal((await request("GET", `/api/works/${a1WorkId}`, undefined, cookieB)).status, 404);
  assert.equal((await request("PATCH", `/api/chapters/${bChapterId}`, {
    content: "<p>越权写入</p>", expectedRevision: 1,
  }, cookieA)).status, 404);
  assert.equal((await request("PUT", "/api/workspace/active", { workId: a1WorkId }, cookieB)).status, 404);

  assert.equal((await request("PUT", "/api/workspace/active", {
    workId: a1WorkId, chapterId: a2ChapterId,
  }, cookieA)).status, 404);
  assert.equal((await request("PATCH", `/api/chapters/${a1ChapterId}`, {
    volumeId: a2VolumeId, expectedRevision: 1,
  }, cookieA)).status, 409);
  assert.equal(data(await request("GET", `/api/chapters/${a1ChapterId}`, undefined, cookieA)).revision, 1);

  const dashboardA = data(await request("GET", "/api/workspace", undefined, cookieA));
  const dashboardB = data(await request("GET", "/api/workspace", undefined, cookieB));
  assert.deepEqual(new Set(dashboardA.works.map((work) => work.id)), new Set([a1WorkId, a2.work.id]));
  assert.deepEqual(dashboardB.works.map((work) => work.id), [bWorkId]);
  console.log("Workspace isolation smoke passed");
} finally {
  cleanupLocalAccounts();
}
