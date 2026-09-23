import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://localhost:5173");
assert.ok(["localhost", "127.0.0.1"].includes(baseUrl.hostname), "此测试只能连接本地开发服务器");

const nonce = crypto.randomUUID().replaceAll("-", "");
const emails = [`stage1-smoke-a-${nonce}@example.test`, `stage1-smoke-b-${nonce}@example.test`];
const userIds = [];
const userIdsByEmail = new Map();

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
  userIdsByEmail.set(email, user.id);
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

function readLocalPreference(userId) {
  assert.match(userId, /^[0-9a-f-]{36}$/i);
  const output = execFileSync(process.execPath, [
    "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--local", "--config", "./dist/server/wrangler.json",
    "--persist-to", ".wrangler/state", "--json", "--command",
    `SELECT active_work_id, active_chapter_id, updated_at FROM workspace_preferences WHERE owner_id = '${userId}'`,
  ], { cwd: new URL("../../", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(output)[0].results[0];
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
  assert.equal((await request("POST", `/api/works/${a1WorkId}/volumes/reorder`, {
    volumeIds: [a1.volumes[0].id],
  }, cookieB)).status, 404);
  assert.equal((await request("GET", `/api/works/${a1WorkId}/stats`, undefined, cookieB)).status, 404);
  assert.equal((await request("POST", `/api/works/${a1WorkId}/chapters/reorder`, {
    volumeId: a1.volumes[0].id,
    chapterIds: [a1ChapterId],
    expectedRevisions: [{ chapterId: a1ChapterId, revision: 1 }],
  }, cookieB)).status, 404);

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

  // PATCH archive must return a successful snapshot, not write then report 404.
  const firstChapter = data(await request("PATCH", `/api/chapters/${a1ChapterId}`, {
    content: "<p>归档恢复应完整保留的原稿</p>", expectedRevision: 1,
  }, cookieA));
  const versionsBefore = data(await request("GET", `/api/chapters/${a1ChapterId}/versions`, undefined, cookieA));
  const activeBefore = data(await request("PUT", "/api/workspace/active", {
    workId: a1WorkId, chapterId: a1ChapterId,
  }, cookieA));
  for (const method of ["PATCH", "DELETE"]) {
    assert.equal((await request(method, `/api/works/${a1WorkId}`,
      method === "PATCH" ? { status: "archived" } : undefined, cookieB)).status, 404);
  }
  assert.equal((await request("PATCH", `/api/works/${a1WorkId}`, {
    status: "invalid", title: "不应保存",
  }, cookieA)).status, 400);
  assert.equal(data(await request("GET", `/api/works/${a1WorkId}`, undefined, cookieA)).work.title, a1.work.title);
  const archived = data(await request("PATCH", `/api/works/${a1WorkId}`, {
    status: "archived", title: "归档时更新标题", description: "保留的描述",
  }, cookieA));
  assert.equal(archived.work.status, "archived");
  assert.equal(archived.work.title, "归档时更新标题");
  assert.equal(archived.work.description, "保留的描述");
  assert.equal(archived.work.totalWords, firstChapter.wordCount);
  assert.equal(archived.work.chapterCount, 1);
  assert.equal(archived.chapters[0].revision, firstChapter.revision);
  assert.equal(archived.chapters[0].content, undefined, "归档响应仍是目录摘要，不返回正文");
  assert.equal(archived.volumes[0].id, a1.volumes[0].id);
  const clearedPreference = readLocalPreference(userIdsByEmail.get(emails[0]));
  assert.deepEqual(clearedPreference, {
    active_work_id: null, active_chapter_id: null, updated_at: archived.work.updatedAt,
  }, "必须真正清空归档作品偏好，不能只依赖 dashboard 回退掩盖旧记录");
  for (const path of [`/api/works/${a1WorkId}`, `/api/works/${a1WorkId}/stats`, `/api/chapters/${a1ChapterId}`]) {
    assert.equal((await request("GET", path, undefined, cookieA)).status, 404);
  }
  assert.equal((await request("PATCH", `/api/works/${a1WorkId}`, { status: "draft" }, cookieA)).status, 404);
  assert.equal((await request("PATCH", `/api/works/${a1WorkId}`, { status: "archived" }, cookieA)).status, 404);
  assert.equal((await request("DELETE", `/api/works/${a1WorkId}`, undefined, cookieA)).status, 404);
  assert.deepEqual(readLocalPreference(userIdsByEmail.get(emails[0])), clearedPreference, "重复或失效请求不能修改偏好时间");
  const afterArchive = data(await request("GET", "/api/workspace", undefined, cookieA));
  assert.notEqual(afterArchive.activeWorkId, activeBefore.activeWorkId);
  assert.equal(afterArchive.activeWorkId, a2.work.id);
  assert.deepEqual(data(await request("GET", "/api/workspace", undefined, cookieB)), dashboardB);
  assert.equal((await request("POST", `/api/trash/works/${a1WorkId}/restore`, undefined, cookieB)).status, 404);
  data(await request("POST", `/api/trash/works/${a1WorkId}/restore`, undefined, cookieA));
  assert.deepEqual(data(await request("GET", `/api/chapters/${a1ChapterId}`, undefined, cookieA)), firstChapter);
  assert.deepEqual(data(await request("GET", `/api/chapters/${a1ChapterId}/versions`, undefined, cookieA)), versionsBefore);
  assert.equal(data(await request("GET", `/api/works/${a1WorkId}`, undefined, cookieA)).work.title, "归档时更新标题");

  // Archiving a non-active work must not change the currently selected work.
  data(await request("PUT", "/api/workspace/active", { workId: a2.work.id, chapterId: a2ChapterId }, cookieA));
  const otherPreference = readLocalPreference(userIdsByEmail.get(emails[0]));
  const races = await Promise.all([
    request("PATCH", `/api/works/${a1WorkId}`, { status: "archived" }, cookieA),
    request("DELETE", `/api/works/${a1WorkId}`, undefined, cookieA),
  ]);
  assert.equal(races.filter((result) => result.status === 200 || result.status === 204).length, 1);
  assert.equal(races.filter((result) => result.status === 404).length, 1);
  assert.deepEqual(readLocalPreference(userIdsByEmail.get(emails[0])), otherPreference, "归档非当前作品不改当前选择或更新时间");
  assert.equal(data(await request("GET", "/api/workspace", undefined, cookieA)).activeChapterId, a2ChapterId);
  data(await request("POST", `/api/trash/works/${a1WorkId}/restore`, undefined, cookieA));
  const completed = data(await request("PATCH", `/api/works/${a1WorkId}`, { status: "completed" }, cookieA));
  assert.equal(completed.work.status, "completed");
  assert.equal(data(await request("PATCH", `/api/works/${a1WorkId}`, { status: "draft" }, cookieA)).work.status, "draft");
  // Race ordinary saves and a history restore against archive. If archive wins, the write
  // must leave content, versions and statistics untouched. If save wins, its
  // response must acknowledge exactly its own committed revision and content.
  for (let round = 0; round < 3; round++) {
    const before = data(await request("GET", `/api/chapters/${a1ChapterId}`, undefined, cookieA));
    const restoreVersionId = round === 2 ? data(await request("POST", `/api/chapters/${a1ChapterId}/versions`, {
      label: "归档竞争前手动快照",
    }, cookieA), 201).id : null;
    const history = data(await request("GET", `/api/chapters/${a1ChapterId}/versions`, undefined, cookieA));
    const stats = data(await request("GET", `/api/works/${a1WorkId}/stats`, undefined, cookieA));
    const content = restoreVersionId ? before.content : `<p>并发归档回归正文${round}</p>`;
    const [saved, archivedRace] = await Promise.all([
      restoreVersionId
        ? request("POST", `/api/chapter-versions/${restoreVersionId}/restore`, { expectedRevision: before.revision }, cookieA)
        : request("PATCH", `/api/chapters/${a1ChapterId}`, { content, expectedRevision: before.revision }, cookieA),
      request("DELETE", `/api/works/${a1WorkId}`, undefined, cookieA),
    ]);
    assert.equal(archivedRace.status, 204);
    assert.ok([200, 404, 409].includes(saved.status), JSON.stringify(saved.payload));
    data(await request("POST", `/api/trash/works/${a1WorkId}/restore`, undefined, cookieA));
    const after = data(await request("GET", `/api/chapters/${a1ChapterId}`, undefined, cookieA));
    if (saved.status === 200) {
      assert.equal(data(saved).content, content);
      assert.equal(data(saved).revision, before.revision + 1);
      assert.deepEqual(after, data(saved));
    } else {
      assert.deepEqual(after, before);
      assert.deepEqual(data(await request("GET", `/api/chapters/${a1ChapterId}/versions`, undefined, cookieA)), history);
      assert.deepEqual(data(await request("GET", `/api/works/${a1WorkId}/stats`, undefined, cookieA)), stats);
    }
  }
  assert.equal((await request("DELETE", `/api/works/${a1WorkId}`, undefined, cookieA)).status, 204);
  assert.equal((await request("DELETE", `/api/works/${a2.work.id}`, undefined, cookieA)).status, 204);
  assert.deepEqual(data(await request("GET", "/api/workspace", undefined, cookieA)), {
    works: [], activeWorkId: null, activeChapterId: null,
  });
  console.log("Work archive regression passed: PATCH/DELETE, recovery, isolation, concurrent archive, empty workspace.");
  console.log("Workspace isolation smoke passed");
} finally {
  cleanupLocalAccounts();
}
