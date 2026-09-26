import type { AiGenerationInput } from "./schemas";
import type { AiContextBudget, AiContextSection } from "./types";

/** A cautious heuristic for common OpenAI-compatible models, not exact billing tokens. */
export const AI_ESTIMATED_TOTAL_TOKEN_BUDGET = 16_000;

const actionInstructions: Record<AiGenerationInput["action"], string> = {
  continue: "续写正文。保持人物、视角、时态和叙事语气一致，只输出可直接审阅的续写内容。",
  rewrite: "根据要求改写所选内容。保留事实与情节作用，只输出改写稿。",
  polish: "润色所选内容。改善节奏、措辞和画面感，不增加未经允许的新设定，只输出润色稿。",
  outline: "生成结构清晰的中文网文大纲，包含冲突、转折、悬念与章节推进建议。",
  brainstorm: "提供多个可区分的情节或人物方案，说明每个方案的推动作用与潜在风险。",
  consistency: "检查前后文、角色、世界观和时间线矛盾。按严重程度列出问题、证据和修正建议，不虚构不存在的冲突。",
};

const systemMessage =
  "你是中文网络小说写作助手。只依据用户明确提供的材料工作；材料不足时指出缺口，不得声称读取了未提供的作品内容。AI 输出只是建议，不得假设会自动覆盖正文。";

function tokenUnits(value: string): number {
  let units = 0;
  for (const character of value) units += character.codePointAt(0)! < 128 ? 1 : 8;
  return units;
}

export function estimateAiTokens(value: string): number {
  return Math.ceil(tokenUnits(value) / 4);
}

function fitContent(value: string, availableUnits: number, keepTail: boolean): string {
  const characters = Array.from(value);
  let units = 0;
  const selected: string[] = [];
  const source = keepTail ? characters.reverse() : characters;
  for (const character of source) {
    const cost = tokenUnits(character);
    if (units + cost > availableUnits) break;
    selected.push(character);
    units += cost;
  }
  return keepTail ? selected.reverse().join("") : selected.join("");
}

export function planAiContext(input: AiGenerationInput): {
  messages: Array<{ role: "system" | "user"; content: string }>;
  budget: AiContextBudget;
} {
  const inputTokenLimit = AI_ESTIMATED_TOTAL_TOKEN_BUDGET - input.maxTokens;
  const userPrefix = `${actionInstructions[input.action]}\n\n用户要求：${input.instruction}\n\n`;
  const fixedUnits = tokenUnits(systemMessage) + tokenUnits(userPrefix);
  let remainingUnits = Math.max(0, inputTokenLimit * 4 - fixedUnits);
  let requestedUnits = 0;
  let includedUnits = 0;
  let omittedCharacters = 0;
  let selectedTextTooLong = false;
  const truncated = new Set<AiContextSection>();
  const parts: string[] = [];

  function add(section: AiContextSection, heading: string, content: string, keepTail = false) {
    const separator = parts.length ? "\n\n" : "";
    const prefix = `${separator}## ${heading}\n`;
    const fullUnits = tokenUnits(prefix + content);
    requestedUnits += fullUnits;
    if (fullUnits <= remainingUnits) {
      parts.push(`${prefix}${content}`);
      remainingUnits -= fullUnits;
      includedUnits += fullUnits;
      return;
    }
    truncated.add(section);
    if (section === "selectedText") {
      selectedTextTooLong = true;
      omittedCharacters += Array.from(content).length;
      return;
    }
    const marker = keepTail ? "…（前文截断）\n" : "\n…（后文截断）";
    const space = remainingUnits - tokenUnits(prefix) - tokenUnits(marker);
    const clipped = space > 0 ? fitContent(content, space, keepTail) : "";
    if (!clipped) {
      omittedCharacters += Array.from(content).length;
      return;
    }
    const included = keepTail ? `${marker}${clipped}` : `${clipped}${marker}`;
    const units = tokenUnits(prefix + included);
    parts.push(`${prefix}${included}`);
    remainingUnits -= units;
    includedUnits += units;
    omittedCharacters += Array.from(content).length - Array.from(clipped).length;
  }

  if (input.selectedText) add("selectedText", "用户选中的文本", input.selectedText);
  for (const item of input.context.chapters) add("chapters", `章节正文：${item.title}`, item.content, true);
  for (const item of input.context.outlines) add("outlines", `大纲：${item.title}`, item.content);
  for (const item of input.context.characters) add("characters", `角色：${item.name}`, item.description);
  for (const item of input.context.worldEntries) add("worldEntries", `世界观：${item.name}`, item.content);
  for (const item of input.context.timelineEvents) add("timelineEvents", `时间线：${item.title}`, item.description);

  return {
    messages: [{ role: "system", content: systemMessage }, { role: "user", content: userPrefix + parts.join("") }],
    budget: {
      estimatedInputTokens: Math.ceil((fixedUnits + includedUnits) / 4),
      inputTokenLimit,
      requestedContextTokens: Math.ceil(requestedUnits / 4),
      includedContextTokens: Math.ceil(includedUnits / 4),
      omittedCharacters,
      truncatedSections: Array.from(truncated),
      selectedTextTooLong,
    },
  };
}
