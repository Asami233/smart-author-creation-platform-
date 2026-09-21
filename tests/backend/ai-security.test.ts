import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatCompletionsUrl, modelsUrl, normalizeProviderBaseUrl } from "../../server/ai/security";

describe("AI provider URL validation", () => {
  it("normalizes a public HTTPS endpoint", () => {
    assert.equal(normalizeProviderBaseUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1");
    assert.equal(chatCompletionsUrl("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
  });

  it("builds model-discovery and chat endpoints from an API root", () => {
    assert.equal(modelsUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1/models");
    assert.equal(chatCompletionsUrl("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
    assert.equal(modelsUrl("https://proxy.example/v1/chat/completions"), "https://proxy.example/v1/models");
  });

  for (const value of [
    "http://api.example.com/v1",
    "https://localhost:8080/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.8/v1",
    "https://192.168.1.4/v1",
    "https://service.local/v1",
  ]) {
    it(`blocks unsafe endpoint ${value}`, () => {
      assert.throws(() => normalizeProviderBaseUrl(value));
    });
  }
});
