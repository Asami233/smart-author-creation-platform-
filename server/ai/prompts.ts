import type { AiGenerationInput } from "@/contracts";

const actionInstructions: Record<AiGenerationInput["action"], string> = {
  continue: "续写正文。保持人物、视角、时态和叙事语气一致，只输出可直接审阅的续写内容。",
  rewrite: "根据要求改写所选内容。保留事实与情节作用，只输出改写稿。",
  polish: "润色所选内容。改善节奏、措辞和画面感，不增加未经允许的新设定，只输出润色稿。",
  outline: "生成结构清晰的中文网文大纲，包含冲突、转折、悬念与章节推进建议。",
  brainstorm: "提供多个可区分的情节或人物方案，说明每个方案的推动作用与潜在风险。",
  consistency: "检查前后文、角色、世界观和时间线矛盾。按严重程度列出问题、证据和修正建议，不虚构不存在的冲突。",
};

function addSection(parts: string[], heading: string, items: string[], budget: { remaining: number }) {
  if (!items.length || budget.remaining <= 0) return;
  const joined = items.join("\n\n");
  const value = joined.slice(0, budget.remaining);
  budget.remaining -= value.length;
  parts.push(`## ${heading}\n${value}`);
}

export function buildAiMessages(input: AiGenerationInput) {
  const budget = { remaining: 120_000 };
  const context: string[] = [];
  addSection(
    context,
    "章节正文",
    input.context.chapters.map((item) => `### ${item.title}\n${item.content}`),
    budget,
  );
  addSection(
    context,
    "大纲",
    input.context.outlines.map((item) => `### ${item.title}\n${item.content}`),
    budget,
  );
  addSection(
    context,
    "角色",
    input.context.characters.map((item) => `- ${item.name}：${item.description}`),
    budget,
  );
  addSection(
    context,
    "世界观",
    input.context.worldEntries.map((item) => `- ${item.name}：${item.content}`),
    budget,
  );
  addSection(
    context,
    "时间线",
    input.context.timelineEvents.map((item) => `- ${item.title}：${item.description}`),
    budget,
  );
  if (input.selectedText) {
    addSection(context, "用户选中的文本", [input.selectedText], budget);
  }

  return [
    {
      role: "system" as const,
      content:
        "你是中文网络小说写作助手。只依据用户明确提供的材料工作；材料不足时指出缺口，不得声称读取了未提供的作品内容。AI 输出只是建议，不得假设会自动覆盖正文。",
    },
    {
      role: "user" as const,
      content: `${actionInstructions[input.action]}\n\n用户要求：${input.instruction}\n\n${context.join("\n\n")}`,
    },
  ];
}
