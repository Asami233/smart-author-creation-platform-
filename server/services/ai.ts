import type { AiGenerationInput } from "@/contracts";
import { all, first, run } from "@/server/db";
import { AppError, notFound } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { isoNow, localDateKey, newId } from "@/server/text";
import { buildAiMessages } from "@/server/ai/prompts";
import { chatCompletionsUrl, normalizeProviderBaseUrl } from "@/server/ai/security";

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
    updatedAt: config.updated_at,
  };
}

export async function saveAiSettings(
  ownerId: string,
  input: { baseUrl: string; model: string; apiKey: string },
) {
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl);
  const encrypted = await encryptSecret(input.apiKey);
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

async function enforceDailyLimit(ownerId: string) {
  const date = localDateKey();
  const usage = await first<{ request_count: number }>(
    "SELECT request_count FROM ai_usage_daily WHERE owner_id = ? AND usage_date = ?",
    ownerId,
    date,
  );
  if ((usage?.request_count ?? 0) >= DAILY_REQUEST_LIMIT) {
    throw new AppError(429, "AI_DAILY_LIMIT_REACHED", "今天的 AI 请求次数已达到本地安全上限");
  }
}

async function recordUsage(ownerId: string, inputTokens: number, outputTokens: number) {
  const now = isoNow();
  await run(
    `INSERT INTO ai_usage_daily
     (id, owner_id, usage_date, request_count, input_tokens, output_tokens, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(owner_id, usage_date) DO UPDATE SET
       request_count = request_count + 1,
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       updated_at = excluded.updated_at`,
    newId(),
    ownerId,
    localDateKey(),
    inputTokens,
    outputTokens,
    now,
    now,
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
  }));
}

export async function generateWithAi(ownerId: string, input: AiGenerationInput) {
  await enforceDailyLimit(ownerId);
  const config = await loadConfig(ownerId);
  const apiKey = await decryptSecret(config.encrypted_api_key, config.key_iv);
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
        messages: buildAiMessages(input),
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

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AppError(502, "AI_EMPTY_RESPONSE", "模型服务没有返回可用内容");
  const inputTokens = payload.usage?.prompt_tokens ?? 0;
  const outputTokens = payload.usage?.completion_tokens ?? 0;
  await recordUsage(ownerId, inputTokens, outputTokens);

  return {
    action: input.action,
    content,
    model: config.model,
    usage: {
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
    },
    contextSummary: {
      chapterCount: input.context.chapters.length,
      outlineCount: input.context.outlines.length,
      characterCount: input.context.characters.length,
      worldEntryCount: input.context.worldEntries.length,
      timelineEventCount: input.context.timelineEvents.length,
    },
  };
}
