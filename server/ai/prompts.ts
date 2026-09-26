import { planAiContext, type AiGenerationInput } from "@/contracts";
import { AppError } from "@/server/errors";

export function prepareAiPrompt(input: AiGenerationInput) {
  const plan = planAiContext(input);
  if (plan.budget.selectedTextTooLong) {
    throw new AppError(400, "AI_SELECTED_TEXT_TOO_LONG", "选中的文本超出本次模型输入预算，请缩短选区或减少输出长度");
  }
  return plan;
}

export function buildAiMessages(input: AiGenerationInput) {
  return prepareAiPrompt(input).messages;
}
