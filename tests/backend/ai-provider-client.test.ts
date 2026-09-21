import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchProviderModels, probeChatCompletion } from "../../server/ai/provider-client";

describe("OpenAI-compatible provider client", () => {
  it("discovers real provider models and removes duplicates", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return Response.json({
        object: "list",
        data: [
          { id: "model-b", owned_by: "vendor" },
          { id: "model-a", owned_by: "vendor" },
          { id: "model-a", owned_by: "vendor" },
        ],
      });
    };
    const models = await fetchProviderModels(
      { baseUrl: "https://provider.example/v1", apiKey: "secret-key" },
      fetcher,
    );
    assert.deepEqual(models.map((model) => model.id), ["model-a", "model-b"]);
    assert.deepEqual(requests, [{
      url: "https://provider.example/v1/models",
      authorization: "Bearer secret-key",
    }]);
  });

  it("performs an actual chat-completions probe", async () => {
    let body: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ message: { content: "连接成功" } }] });
    };
    const result = await probeChatCompletion(
      { baseUrl: "https://provider.example/v1", apiKey: "secret-key", model: "model-a" },
      fetcher,
    );
    assert.equal(result.connected, true);
    assert.equal(result.responsePreview, "连接成功");
    assert.equal(body.model, "model-a");
    assert.equal(body.stream, false);
  });

  it("maps rejected credentials to a stable backend error", async () => {
    const fetcher: typeof fetch = async () => new Response("unauthorized", { status: 401 });
    await assert.rejects(
      fetchProviderModels(
        { baseUrl: "https://provider.example/v1", apiKey: "bad-key" },
        fetcher,
      ),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "AI_AUTH_FAILED",
    );
  });
});
