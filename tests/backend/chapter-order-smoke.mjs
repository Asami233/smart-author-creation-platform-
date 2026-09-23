import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://localhost:5173");
assert.ok(["localhost", "127.0.0.1"].includes(baseUrl.hostname), "此测试只能连接本地开发服务器");
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const nonce = crypto.randomUUID().replaceAll("-", "");
const email = `chapter-order-smoke-${nonce}@example.test`;
let userId;
let cookie;

async function request(method, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  return {
    status: response.status,
    payload: isJson ? await response.json() : null,
    text: isJson ? null : await response.text(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

function data(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.payload));
  return result.payload.data;
}

function cleanup() {
  assert.match(email, /^chapter-order-smoke-[0-9a-f]+@example\.test$/);
  if (userId) assert.match(userId, /^[0-9a-f-]{36}$/i);
  const sql = [
    ...(userId ? [`DELETE FROM works WHERE owner_id = '${userId}'`,
      `DELETE FROM workspace_preferences WHERE owner_id = '${userId}'`] : []),
    `DELETE FROM auth_challenges WHERE email = '${email}'`,
    ...(userId ? [`DELETE FROM auth_users WHERE id = '${userId}'`] : []),
  ].join("; ");
  execFileSync(process.execPath, [
    "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--local", "--config", "./dist/server/wrangler.json",
    "--persist-to", ".wrangler/state", "--command", sql,
  ], { cwd: repoRoot, stdio: "pipe" });
}

try {
  const started = data(await request("POST", "/api/auth/register/start", {
    email, penName: "章节排序回归作者", password: `OrderSmoke${nonce.slice(0, 14)}`,
  }), 202);
  assert.match(started.devCode ?? "", /^\d{6}$/);
  const verified = await request("POST", "/api/auth/register/verify", { email, code: started.devCode });
  userId = data(verified, 201).user.id;
  cookie = verified.cookie;
  assert.ok(cookie);

  const first = data(await request("POST", "/api/works", { title: "章节组织回归作品" }), 201);
  const second = data(await request("POST", "/api/works", { title: "外部作品" }), 201);
  const workId = first.work.id;
  const v1 = first.volumes[0].id;
  const a = first.chapters[0].id;
  const getWork = async () => data(await request("GET", `/api/works/${workId}`));
  const getChapter = async (id) => data(await request("GET", `/api/chapters/${id}`));
  const addVolume = async (title) => data(await request("POST", `/api/works/${workId}/volumes`, { title }), 201).id;
  const addChapter = async (volumeId, title) => data(await request("POST", `/api/works/${workId}/chapters`, {
    volumeId, title, content: `<p>${title}的正文</p>`,
  }), 201).id;
  const v2 = await addVolume("第二卷");
  const empty = await addVolume("空卷");
  const b = await addChapter(v1, "章节乙");
  const c = await addChapter(v1, "章节丙");
  const d = await addChapter(v2, "章节丁");
  const e = await addChapter(null, "未分卷章");
  data(await request("PATCH", `/api/chapters/${a}`, {
    title: "章节甲", content: "<p>移动不会丢失的原稿</p>", expectedRevision: 1,
  }));
  data(await request("POST", `/api/chapters/${a}/versions`, { label: "移动前备份" }), 201);
  const character = data(await request("POST", `/api/works/${workId}/knowledge/characters`, { name: "测试角色" }), 201);
  data(await request("POST", `/api/chapters/${a}/links`, { entityType: "character", entityId: character.id }), 201);
  data(await request("PUT", "/api/workspace/active", { workId, chapterId: a }));
  const versionsBefore = data(await request("GET", `/api/chapters/${a}/versions`));
  const linksBefore = data(await request("GET", `/api/chapters/${a}/links`));
  const statsBefore = data(await request("GET", `/api/works/${workId}/stats`));
  const workspaceBefore = data(await request("GET", "/api/workspace"));
  const originals = new Map(await Promise.all([a, b, c, d, e].map(async (id) => [id, await getChapter(id)])));
  const orderPath = `/api/works/${workId}/chapters/reorder`;
  const payloadFor = async (volumeId, chapterIds) => {
    const chapters = (await getWork()).chapters;
    return { volumeId, chapterIds, expectedRevisions: chapterIds.map((chapterId) => ({
      chapterId, revision: chapters.find((chapter) => chapter.id === chapterId)?.revision ?? 1,
    })) };
  };
  const order = async (volumeId, chapterIds) => data(await request("POST", orderPath, await payloadFor(volumeId, chapterIds)));
  const checkOrder = async (volumeId, ids) => {
    const chapters = (await getWork()).chapters.filter((chapter) => chapter.volumeId === volumeId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    assert.deepEqual(chapters.map((chapter) => chapter.id), ids);
    assert.deepEqual(chapters.map((chapter) => chapter.sortOrder), ids.map((_, index) => index));
  };
  const unchangedAfter = async (body, status) => {
    const before = await getWork();
    assert.equal((await request("POST", orderPath, body)).status, status);
    assert.deepEqual(await getWork(), before, "被拒绝的请求不能部分改序或更新作品时间");
  };

  const response = await order(v1, [c, a, b]);
  assert.equal(response.length, 5, "返回全书目录摘要，而非仅目标卷");
  assert.ok(response.every((chapter) => chapter.content === ""), "摘要空 content 不是正文");
  await checkOrder(v1, [c, a, b]);
  for (const id of [a, b, c]) assert.equal((await getChapter(id)).revision, originals.get(id).revision + 1);
  assert.equal((await request("PATCH", `/api/chapters/${a}`, {
    content: "<p>不应写入的迟到旧稿</p>", expectedRevision: originals.get(a).revision,
  })).status, 409, "移动后的章节必须拒绝旧版本自动保存");
  const noOpBefore = await getWork();
  await order(v1, [c, a, b]);
  assert.deepEqual(await getWork(), noOpBefore, "无变化排序不得增加修订号或改变时间");
  const sourceSurvivors = [await getChapter(c), await getChapter(b)];
  await order(v2, [d, a]);
  await checkOrder(v2, [d, a]);
  assert.deepEqual([await getChapter(c), await getChapter(b)], sourceSurvivors, "源卷剩余章节不重编号、不产生无关修订");
  await unchangedAfter(await payloadFor(v2, [a]), 409);
  await unchangedAfter(await payloadFor(v2, [d, a, second.chapters[0].id]), 409);
  await unchangedAfter(await payloadFor(second.volumes[0].id, [a]), 409);
  await unchangedAfter({ volumeId: v2, chapterIds: [d, d] }, 400);
  await unchangedAfter({ volumeId: v2, chapterIds: [d, a], expectedRevisions: [{ chapterId: d, revision: 1 }] }, 400);
  await unchangedAfter({ volumeId: v2, chapterIds: [] }, 400);
  assert.deepEqual(data(await request("GET", `/api/chapters/${a}/versions`)), versionsBefore);
  assert.deepEqual(data(await request("GET", `/api/works/${workId}/stats`)), statsBefore);

  const stale = await payloadFor(v2, [a, d]);
  const beforeSave = await getChapter(a);
  const saved = data(await request("PATCH", `/api/chapters/${a}`, {
    content: "<p>其他标签刚刚保存的更新正文</p>", expectedRevision: beforeSave.revision,
  }));
  await unchangedAfter(stale, 409);
  assert.equal((await getChapter(a)).content, saved.content);
  // Reset content through the public save API, then take new invariant baselines.
  data(await request("PATCH", `/api/chapters/${a}`, { content: originals.get(a).content, expectedRevision: saved.revision }));
  const versionsAfterSave = data(await request("GET", `/api/chapters/${a}/versions`));
  const statsAfterSave = data(await request("GET", `/api/works/${workId}/stats`));
  assert.ok(statsAfterSave.todayWordsWritten >= statsBefore.todayWordsWritten);

  await order(empty, [a]);
  await checkOrder(empty, [a]);
  await order(null, [a, e]);
  await checkOrder(null, [a, e]);
  await order(v1, [b, a, c]);
  await checkOrder(v1, [b, a, c]);
  const baseline = await payloadFor(v1, [a, c, b]);
  const concurrent = await Promise.all([
    request("POST", orderPath, baseline),
    request("POST", orderPath, { ...baseline, chapterIds: [c, b, a] }),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409], "同版本互斥排序只能成功一次");
  const winner = concurrent[0].status === 200 ? [a, c, b] : [c, b, a];
  await checkOrder(v1, winner);
  data(await request("POST", orderPath, { volumeId: v1, chapterIds: [a, b, c] }));
  await checkOrder(v1, [a, b, c]);
  const exported = await request("GET", `/api/works/${workId}/export?format=txt`);
  assert.equal(exported.status, 200);
  assert.ok(exported.text.indexOf("章节甲") < exported.text.indexOf("章节乙"));
  assert.ok(exported.text.indexOf("章节乙") < exported.text.indexOf("章节丙"));

  for (const [id, original] of originals) {
    const current = await getChapter(id);
    for (const field of ["content", "title", "summary", "wordCount", "status", "createdAt"]) {
      assert.deepEqual(current[field], original[field], `移动不改变 ${field}`);
    }
  }
  assert.deepEqual(data(await request("GET", `/api/chapters/${a}/versions`)), versionsAfterSave);
  assert.deepEqual(data(await request("GET", `/api/chapters/${a}/links`)), linksBefore);
  assert.deepEqual(data(await request("GET", `/api/works/${workId}/stats`)), statsAfterSave);
  const workspaceAfter = data(await request("GET", "/api/workspace"));
  assert.equal(workspaceAfter.activeWorkId, workspaceBefore.activeWorkId);
  assert.equal(workspaceAfter.activeChapterId, workspaceBefore.activeChapterId);

  assert.equal((await request("DELETE", `/api/chapters/${e}`)).status, 204);
  await unchangedAfter(await payloadFor(null, [e]), 409);
  assert.equal((await request("DELETE", `/api/volumes/${empty}`)).status, 204);
  await unchangedAfter(await payloadFor(empty, [a]), 409);

  // More than 100 IDs verifies that the SQL does not use one bind per chapter.
  const largeVolume = await addVolume("长篇容量测试");
  const manyIds = [];
  for (let index = 0; index < 105; index++) manyIds.push(await addChapter(largeVolume, `容量章${index}`));
  await order(largeVolume, [...manyIds].reverse());
  await checkOrder(largeVolume, [...manyIds].reverse());
  // A legal gap can remain after moving/deleting source chapters. Even an
  // existing target member gets a revision when the target is renumbered.
  const gapVolume = await addVolume("有排序空隙的目标卷");
  const gapChapter = data(await request("POST", `/api/works/${workId}/chapters`, {
    volumeId: gapVolume, title: "空隙章节", sortOrder: 5, content: "<p>原文不变</p>",
  }), 201);
  await order(gapVolume, [gapChapter.id, a]);
  await checkOrder(gapVolume, [gapChapter.id, a]);
  const normalized = await getChapter(gapChapter.id);
  assert.equal(normalized.revision, gapChapter.revision + 1, "原有目标章被重新编号也应增加修订");
  assert.equal(normalized.content, gapChapter.content);
  assert.equal((await request("DELETE", `/api/works/${workId}`)).status, 204);
  assert.equal((await request("POST", orderPath, { volumeId: v1, chapterIds: [a, b, c] })).status, 404);
  console.log("Chapter order smoke passed: reorder, move, null target, no-op, conflicts, concurrent writers, content/history/links/stats, export, 105 chapters, archived access.");
} finally {
  cleanup();
  console.log("Temporary chapter-order test data removed.");
}
