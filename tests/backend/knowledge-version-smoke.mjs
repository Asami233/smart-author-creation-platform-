import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://localhost:5173");
assert.ok(["localhost", "127.0.0.1"].includes(baseUrl.hostname), "此测试只能连接本地开发服务器");
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const nonce = crypto.randomUUID().replaceAll("-", "");
const email = `stage2-smoke-${nonce}@example.test`;
let userId;
let cookie;

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    payload: contentType.includes("application/json") ? await response.json() : null,
    bytes: contentType.includes("application/json") ? null : new Uint8Array(await response.arrayBuffer()),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

function data(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.payload));
  return result.payload.data;
}

function cleanupLocalAccount() {
  assert.match(email, /^stage2-smoke-[0-9a-f]+@example\.test$/);
  const sql = [
    ...(userId ? [
      `DELETE FROM works WHERE owner_id = '${userId}'`,
      `DELETE FROM workspace_preferences WHERE owner_id = '${userId}'`,
    ] : []),
    `DELETE FROM auth_challenges WHERE email = '${email}'`,
    ...(userId ? [`DELETE FROM auth_users WHERE id = '${userId}'`] : []),
  ].join("; ");
  if (userId) assert.match(userId, /^[0-9a-f-]{36}$/i);
  execFileSync(process.execPath, [
    "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--local", "--config", "./dist/server/wrangler.json",
    "--persist-to", ".wrangler/state", "--command", sql,
  ], { cwd: repoRoot, stdio: "pipe" });
}

try {
  const started = data(await request("POST", "/api/auth/register/start", {
    email,
    penName: "设定版本回归作者",
    password: `Stage2Smoke${nonce.slice(0, 14)}`,
  }), 202);
  assert.match(started.devCode ?? "", /^\d{6}$/);
  const verified = await request("POST", "/api/auth/register/verify", { email, code: started.devCode });
  userId = data(verified, 201).user.id;
  cookie = verified.cookie;
  assert.ok(cookie);

  const createWork = (title) => request("POST", "/api/works", {
    title, description: "本地阶段 2 回归测试", genre: "玄幻", targetWords: 100000,
  });
  const first = data(await createWork("第一部作品"), 201);
  const second = data(await createWork("第二部作品"), 201);
  const workId = first.work.id;
  const chapterId = first.chapters[0].id;
  const otherVolumeId = second.volumes[0].id;

  assert.equal((await request("POST", `/api/works/${workId}/knowledge/outlines`, {
    scopeType: "volume", scopeId: otherVolumeId, title: "错误的跨作品大纲",
  })).status, 409);
  const outline = data(await request("POST", `/api/works/${workId}/knowledge/outlines`, {
    scopeType: "volume", scopeId: first.volumes[0].id, title: "第一卷大纲",
  }), 201);
  assert.equal((await request("PATCH", `/api/knowledge/outlines/${outline.id}`, {
    scopeId: otherVolumeId,
  })).status, 409);

  const character = data(await request("POST", `/api/works/${workId}/knowledge/characters`, {
    name: "主角甲",
  }), 201);
  const otherCharacter = data(await request("POST", `/api/works/${second.work.id}/knowledge/characters`, {
    name: "主角乙",
  }), 201);
  assert.equal((await request("POST", `/api/works/${workId}/knowledge/timeline`, {
    title: "错误的跨作品事件", participantIds: [otherCharacter.id],
  })).status, 409);
  const event = data(await request("POST", `/api/works/${workId}/knowledge/timeline`, {
    title: "故事开端", participantIds: [character.id], relatedChapterId: chapterId,
  }), 201);
  assert.equal((await request("PATCH", `/api/knowledge/timeline/${event.id}`, {
    participantIds: [otherCharacter.id],
  })).status, 409);
  assert.equal((await request("POST", `/api/chapters/${chapterId}/links`, {
    entityType: "character", entityId: otherCharacter.id,
  })).status, 409);
  assert.equal(data(await request("POST", `/api/chapters/${chapterId}/links`, {
    entityType: "character", entityId: character.id,
  }), 201).length, 1);
  assert.equal((await request("DELETE", `/api/knowledge/characters/${character.id}`)).status, 204);
  assert.deepEqual(data(await request("GET", `/api/knowledge/timeline/${event.id}`)).participantIds, []);
  assert.deepEqual(data(await request("GET", `/api/chapters/${chapterId}/links`)), []);

  const oldChapter = data(await request("PATCH", `/api/chapters/${chapterId}`, {
    content: "<p>旧稿正文</p>", expectedRevision: 1,
  }));
  const manual = data(await request("POST", `/api/chapters/${chapterId}/versions`, { label: "旧稿" }), 201);
  const newChapter = data(await request("PATCH", `/api/chapters/${chapterId}`, {
    content: "<p>新稿正文更长</p>", expectedRevision: oldChapter.revision,
  }));
  const statsBeforeRestore = data(await request("GET", `/api/works/${workId}/stats`));
  assert.equal((await request("POST", `/api/chapter-versions/${manual.id}/restore`, {
    expectedRevision: oldChapter.revision,
  })).status, 409);
  const restored = data(await request("POST", `/api/chapter-versions/${manual.id}/restore`, {
    expectedRevision: newChapter.revision,
  }));
  assert.equal(restored.content, oldChapter.content);
  assert.equal(restored.revision, newChapter.revision + 1);
  const statsAfterRestore = data(await request("GET", `/api/works/${workId}/stats`));
  assert.deepEqual(statsAfterRestore.daily, statsBeforeRestore.daily, "恢复旧稿不应虚增今日写作字数");
  const versions = data(await request("GET", `/api/chapters/${chapterId}/versions`));
  const restoreBackup = versions.find((version) => version.kind === "restore");
  assert.ok(restoreBackup, "恢复前应创建当前正文快照");
  assert.equal(data(await request("GET", `/api/chapter-versions/${restoreBackup.id}`)).content, newChapter.content);
  const legacyRestore = data(await request("POST", `/api/chapter-versions/${manual.id}/restore`));
  assert.equal(legacyRestore.revision, restored.revision + 1, "无请求体的旧客户端恢复方式仍须兼容");

  for (const format of ["txt", "docx", "pdf"]) {
    const exported = await request("GET", `/api/works/${workId}/export?format=${format}`);
    assert.equal(exported.status, 200);
    assert.ok(exported.bytes.length > 20);
    if (format === "txt") assert.ok(new TextDecoder().decode(exported.bytes).includes("旧稿正文"));
    if (format === "docx") assert.deepEqual([...exported.bytes.slice(0, 2)], [0x50, 0x4b]);
    if (format === "pdf") assert.equal(new TextDecoder().decode(exported.bytes.slice(0, 4)), "%PDF");
  }

  assert.equal((await request("DELETE", `/api/chapters/${chapterId}`)).status, 204);
  assert.equal((await request("GET", `/api/chapters/${chapterId}`)).status, 404);
  const recovered = data(await request("POST", `/api/trash/chapters/${chapterId}/restore`));
  assert.equal(recovered.restored, true);
  assert.equal((await request("DELETE", `/api/volumes/${first.volumes[0].id}`)).status, 204);
  const preservedOutline = data(await request("GET", `/api/knowledge/outlines/${outline.id}`));
  assert.equal(preservedOutline.scopeType, "work");
  assert.equal(preservedOutline.scopeId, null);
  console.log("Knowledge, version, export, and trash smoke passed");
} finally {
  cleanupLocalAccount();
}
