import type { AiConnectionTestResult, AiProviderModel } from "@/contracts";
import { AppError } from "@/server/errors";
import { chatCompletionsUrl, modelsUrl } from "./security";

const CONNECTION_TIMEOUT_MS = 20_000;

type Fetcher = typeof fetch;

async function providerFetch(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (response.status === 401 || response.status === 403) {
      throw new AppError(502, "AI_AUTH_FAILED", "AI 服务拒绝了 API Key");
    }
    if (response.status === 429) {
      throw new AppError(429, "AI_PROVIDER_RATE_LIMITED", "AI 服务请求过于频繁，请稍后再试");
    }
    if (!response.ok) {
      throw new AppError(502, "AI_PROVIDER_ERROR", `AI 服务返回错误（${response.status}）`);
    }
    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError(504, "AI_TIMEOUT", "AI 服务连接测试超时");
    }
    throw new AppError(502, "AI_PROVIDER_UNREACHABLE", "无法连接 AI 服务，请检查 API 地址");
  } finally {
    clearTimeout(timeout);
  }
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AppError(502, "AI_INVALID_RESPONSE", "AI 服务返回了无法识别的数据");
  }
}

export async function fetchProviderModels(
  input: { baseUrl: string; apiKey: string },
  fetcher: Fetcher = fetch,
): Promise<AiProviderModel[]> {
  const response = await providerFetch(
    modelsUrl(input.baseUrl),
    { method: "GET", headers: { authorization: `Bearer ${input.apiKey}` } },
    fetcher,
  );
  const payload = await responseJson(response);
  const entries = typeof payload === "object" && payload !== null && "data" in payload
    ? (payload as { data?: unknown }).data
    : null;
  if (!Array.isArray(entries)) {
    throw new AppError(502, "AI_INVALID_RESPONSE", "AI 服务返回了无法识别的模型列表");
  }
  const models = entries
    .filter((item): item is { id: string; owned_by?: string } =>
      typeof item === "object" && item !== null &&
      typeof (item as { id?: unknown }).id === "string" &&
      (item as { id: string }).id.trim().length > 0,
    )
    .map<AiProviderModel>((item) => ({
      id: item.id.trim(),
      ownedBy: typeof item.owned_by === "string" ? item.owned_by : null,
    }))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (models.length === 0) {
    throw new AppError(502, "AI_NO_MODELS", "AI 服务没有返回可用模型");
  }
  return models;
}

export async function probeChatCompletion(
  input: { baseUrl: string; apiKey: string; model: string },
  fetcher: Fetcher = fetch,
): Promise<AiConnectionTestResult> {
  const startedAt = Date.now();
  const response = await providerFetch(
    chatCompletionsUrl(input.baseUrl),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "user", content: "请只回复：连接成功" }],
        max_tokens: 16,
        stream: false,
      }),
    },
    fetcher,
  );
  const payload = await responseJson(response) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AppError(502, "AI_EMPTY_RESPONSE", "模型连接成功，但没有返回文本内容");
  return {
    connected: true,
    baseUrl: input.baseUrl,
    model: input.model,
    latencyMs: Date.now() - startedAt,
    responsePreview: content.slice(0, 200),
  };
}
