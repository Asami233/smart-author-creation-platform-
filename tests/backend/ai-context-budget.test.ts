import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiGenerationSchema } from "../../contracts/schemas";
import { planAiContext } from "../../contracts/ai-context";
import { prepareAiPrompt } from "../../server/ai/prompts";

describe("AI context budget and privacy", () => {
  it("keeps the selected text in full before trimming the chapter tail", () => {
    const input = aiGenerationSchema.parse({
      action: "rewrite", instruction: "改写选区", selectedText: "必须保留的原句",
      context: {
        chapters: [{ title: "第一章", content: "旧".repeat(40_000) + "最后一段" }],
        outlines: [{ title: "未勾选时不应出现", content: "" }],
      },
    });
    const plan = planAiContext(input);
    assert.equal(plan.budget.selectedTextTooLong, false);
    assert.ok(plan.budget.estimatedInputTokens <= plan.budget.inputTokenLimit);
    assert.ok(plan.budget.truncatedSections.includes("chapters"));
    assert.ok(plan.budget.omittedCharacters > 0);
    assert.ok(plan.messages[1].content.includes("必须保留的原句"));
    assert.ok(plan.messages[1].content.includes("最后一段"));
    assert.ok(plan.messages[1].content.includes("前文截断"));
  });

  it("rejects a selected passage that cannot fit without silent clipping", () => {
    const input = aiGenerationSchema.parse({
      action: "polish", instruction: "润色", selectedText: "长".repeat(10_000), maxTokens: 8000,
    });
    assert.equal(planAiContext(input).budget.selectedTextTooLong, true);
    assert.throws(() => prepareAiPrompt(input), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "AI_SELECTED_TEXT_TOO_LONG");
  });

  it("sends only explicitly included material", () => {
    const input = aiGenerationSchema.parse({
      action: "brainstorm", instruction: "给出方案",
      context: { characters: [{ name: "主角", description: "勇敢" }] },
    });
    const text = prepareAiPrompt(input).messages[1].content;
    assert.match(text, /主角/);
    assert.doesNotMatch(text, /章节正文|世界观：|时间线：/);
  });
});
