import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:5173";

async function request(method, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, payload };
}

function data(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.payload));
  return result.payload.data;
}

let workId;
try {
  const created = data(await request("POST", "/api/works", {
    title: `并发保存回归 ${crypto.randomUUID()}`,
    description: "仅用于本地 API 测试",
    genre: "玄幻",
    targetWords: 100000,
  }), 201);
  workId = created.work.id;
  const chapterId = created.chapters[0].id;
  const chapterPath = `/api/chapters/${chapterId}`;

  const firstSave = data(await request("PATCH", chapterPath, {
    content: "<p>第一段正文</p>",
  }));
  assert.equal(firstSave.revision, 2);
  assert.equal((await request("PATCH", chapterPath, {
    content: "<p>过期版本</p>",
    expectedRevision: 1,
  })).status, 409);

  // Both candidates cross the 200-word snapshot threshold if they win.
  const candidates = [`<p>${"山".repeat(210)}</p>`, `<p>${"海".repeat(220)}</p>`];
  const results = await Promise.all(candidates.map((content) => request("PATCH", chapterPath, {
    content,
    expectedRevision: 2,
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);

  const winner = data(results.find((result) => result.status === 200));
  const persisted = data(await request("GET", chapterPath));
  assert.equal(persisted.revision, 3);
  assert.equal(persisted.content, winner.content);
  assert.equal(persisted.wordCount, winner.wordCount);

  const stats = data(await request("GET", `/api/works/${workId}/stats`));
  assert.equal(stats.totalWords, winner.wordCount);
  assert.equal(stats.daily.reduce((sum, day) => sum + day.wordsWritten, 0), winner.wordCount);

  const versions = data(await request("GET", `${chapterPath}/versions`));
  assert.equal(versions.length, 2, "失败保存不得产生多余的自动快照");
  console.log(`Workspace concurrency smoke passed: ${workId}`);
} finally {
  if (workId) {
    const removed = await request("DELETE", `/api/works/${workId}`);
    assert.equal(removed.status, 204, JSON.stringify(removed.payload));
  }
}
