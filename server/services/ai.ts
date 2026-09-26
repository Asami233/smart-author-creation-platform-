import type { AiGenerationInput } from "@/contracts";
import { all, first, run } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { isoNow, localDateKey, newId } from "@/server/text";
import { fetchProviderModels, probeChatCompletion } from "@/server/ai/provider-client";
import { chatCompletionsUrl, normalizeProviderBaseUrl } from "@/server/ai/security";
import { createAiStreamResponse } from "@/server/ai/stream";
import { prepareAiPrompt } from "@/server/ai/prompts";
import { RESERVE_AI_REQUEST_SQL, reportedTokens } from "@/server/ai/usage";

type AiConfigRow = {
  id: string;
  owner_id: string;
  base_url: string;
  model: string;
  encrypted_api_key: string;
  key_iv: string;
  created_at: string;
  updated_at: string;
};

const DAILY_REQUEST_LIMIT = 100;
type ProviderInput = { baseUrl?: string; apiKey?: string; model?: string };

export async function getAiSettings(ownerId: string) {
  const config = await first<AiConfigRow>(
    `SELECT id, owner_id, base_url, model, encrypted_api_key, key_iv, created_at, updated_at
     FROM ai_provider_configs WHERE owner_id = ?`,
    ownerId,
  );
  if (!config) return { configured: false as const };
  return {
    configured: true as const,
    baseUrl: config.base_url,
    model: config.model,
    apiKeyHint: "••••••••",
    apiKeyConfigured: true as const,
    updatedAt: config.updated_at,
  };
}

export async function saveAiSettings(
  ownerId: string,
  input: { baseUrl: string; model: string; apiKey?: string },
) {
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl);
  const existing = await first<AiConfigRow>(
    `SELECT id, owner_id, base_url, model, encrypted_api_key, key_iv, created_at, updated_at
     FROM ai_provider_configs WHERE owner_id = ?`,
    ownerId,
  );
  if (!input.apiKey && !existing) {
    throw new AppError(400, "AI_API_KEY_REQUIRED", "首次配置时必须填写 API Key");
  }
  const encrypted = input.apiKey
    ? await encryptSecret(input.apiKey)
    : { cipherText: existing!.encrypted_api_key, iv: existing!.key_iv };
  const now = isoNow();
  await run(
    `INSERT INTO ai_provider_configs
     (id, owner_id, base_url, model, encrypted_api_key, key_iv, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET
       base_url = excluded.base_url,
       model = excluded.model,
       encrypted_api_key = excluded.encrypted_api_key,
       key_iv = excluded.key_iv,
       updated_at = excluded.updated_at`,
    newId(),
    ownerId,
    baseUrl,
    input.model,
    encrypted.cipherText,
    encrypted.iv,
    now,
    now,
  );
  return getAiSettings(ownerId);
}

async function resolveProviderInput(ownerId: string, input: ProviderInput) {
  const saved = await first<AiConfigRow>(
    `SELECT id, owner_id, base_url, model, encrypted_api_key, key_iv, created_at, updated_at
     FROM ai_provider_configs WHERE owner_id = ?`,
    ownerId,
  );
  const baseUrl = input.baseUrl ?? saved?.base_url;
  const model = input.model ?? saved?.model;
  const apiKey = input.apiKey ??
    (saved ? await decryptSecret(saved.encrypted_api_key, saved.key_iv) : undefined);
  if (!baseUrl || !apiKey) {
    throw new AppError(400, "AI_CONFIG_INCOMPLETE", "请填写 API 地址和 API Key");
  }
  return {
    baseUrl: normalizeProviderBaseUrl(baseUrl),
    apiKey,
    model,
  };
}

export async function listAvailableModels(
  ownerId: string,
  input: { baseUrl?: string; apiKey?: string },
) {
  const provider = await resolveProviderInput(ownerId, input);
  const models = await fetchProviderModels(provider);
  return { baseUrl: provider.baseUrl, models };
}

export async function testAiConnection(ownerId: string, input: ProviderInput) {
  const provider = await resolveProviderInput(ownerId, input);
  if (!provider.model) throw new AppError(400, "AI_MODEL_REQUIRED", "请选择或填写模型名称");
  return probeChatCompletion({ ...provider, model: provider.model });
}

export async function deleteAiSettings(ownerId: string): Promise<void> {
  await run("DELETE FROM ai_provider_configs WHERE owner_id = ?", ownerId);
}

async function loadConfig(ownerId: string): Promise<AiConfigRow> {
  const row = await first<AiConfigRow>(
    `SELECT id, owner_id, base_url, model, encrypted_api_key, key_iv, created_at, updated_at
     FROM ai_provider_configs WHERE owner_id = ?`,
    ownerId,
  );
  if (!row) notFound("AI 配置");
  return row;
}

async function reserveAiRequest(ownerId: string): Promise<string> {
  const date = localDateKey();
  const now = isoNow();
  const reserved = await first<{ request_count: number }>(
    RESERVE_AI_REQUEST_SQL,
    newId(), ownerId, date, now, now, DAILY_REQUEST_LIMIT,
  );
  if (!reserved) {
    throw new AppError(429, "AI_DAILY_LIMIT_REACHED", "今天的 AI 请求次数已达到本地安全上限");
  }
  return date;
}

async function recordReportedTokens(ownerId: string, date: string, inputTokens: unknown, outputTokens: unknown) {
  await run(
    `UPDATE ai_usage_daily SET
       input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, updated_at = ?
     WHERE owner_id = ? AND usage_date = ?`,
    reportedTokens(inputTokens), reportedTokens(outputTokens), isoNow(), ownerId, date,
  );
}

export async function getAiUsage(ownerId: string) {
  const rows = await all<{ usage_date: string; request_count: number; input_tokens: number; output_tokens: number }>(
    `SELECT usage_date, request_count, input_tokens, output_tokens
     FROM ai_usage_daily WHERE owner_id = ? ORDER BY usage_date DESC LIMIT 30`,
    ownerId,
  );
  return rows.map((row) => ({
    date: row.usage_date,
    requestCount: row.request_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    requestLimit: DAILY_REQUEST_LIMIT,
    requestCountMeaning: "attempts" as const,
    tokenCountMeaning: "provider_reported_on_completed_requests" as const,
  }));
}

export async function generateWithAi(ownerId: string, input: AiGenerationInput) {
  const prompt = prepareAiPrompt(input);
  const config = await loadConfig(ownerId);
  const apiKey = await decryptSecret(config.encrypted_api_key, config.key_iv);
  const usageDate = await reserveAiRequest(ownerId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl(config.base_url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: prompt.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "AI_TIMEOUT", "模型服务在 60 秒内没有响应");
    }
    throw new AppError(502, "AI_PROVIDER_UNREACHABLE", "无法连接模型服务，请检查接口地址");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AppError(502, "AI_AUTH_FAILED", "模型服务拒绝了密钥，请重新配置");
    }
    if (response.status === 429) {
      throw new AppError(429, "AI_PROVIDER_RATE_LIMITED", "模型服务请求过于频繁，请稍后再试");
    }
    throw new AppError(502, "AI_PROVIDER_ERROR", `模型服务返回错误（${response.status}）`);
  }

  const payload = (await response.json().catch(() => {
    throw new AppError(502, "AI_INVALID_RESPONSE", "模型服务返回了无法识别的数据");
  })) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: {
      prompt_tokens?: unknown; completion_tokens?: unknown;
      input_tokens?: unknown; output_tokens?: unknown;
    };
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  const content = (typeof rawContent === "string" ? rawContent : Array.isArray(rawContent)
    ? rawContent.map((part) => part && typeof part === "object" && typeof part.text === "string" ? part.text : "").join("")
    : "").trim();
  if (!content) throw new AppError(502, "AI_EMPTY_RESPONSE", "模型服务没有返回可用内容");
  const rawInputTokens = payload.usage?.prompt_tokens ?? payload.usage?.input_tokens;
  const rawOutputTokens = payload.usage?.completion_tokens ?? payload.usage?.output_tokens;
  const inputTokens = typeof rawInputTokens === "number" && Number.isSafeInteger(rawInputTokens) && rawInputTokens >= 0 ? rawInputTokens : null;
  const outputTokens = typeof rawOutputTokens === "number" && Number.isSafeInteger(rawOutputTokens) && rawOutputTokens >= 0 ? rawOutputTokens : null;
  await recordReportedTokens(ownerId, usageDate, inputTokens, outputTokens);

  return {
    action: input.action,
    content,
    model: config.model,
    usage: {
      inputTokens,
      outputTokens,
    },
    contextSummary: {
      chapterCount: input.context.chapters.length,
      outlineCount: input.context.outlines.length,
      characterCount: input.context.characters.length,
      worldEntryCount: input.context.worldEntries.length,
      timelineEventCount: input.context.timelineEvents.length,
    },
    contextBudget: prompt.budget,
  };
}

export async function streamWithAi(ownerId: string, input: AiGenerationInput, signal: AbortSignal) {
  const prompt = prepareAiPrompt(input);
  const config = await loadConfig(ownerId);
  const apiKey = await decryptSecret(config.encrypted_api_key, config.key_iv);
  const usageDate = await reserveAiRequest(ownerId);
  return createAiStreamResponse({
    baseUrl: config.base_url,
    apiKey,
    model: config.model,
    input,
    messages: prompt.messages,
    contextBudget: prompt.budget,
    requestId: newId(),
    signal,
    onDone: async (usage) => {
      await recordReportedTokens(ownerId, usageDate, usage.inputTokens, usage.outputTokens);
    },
  });
}
