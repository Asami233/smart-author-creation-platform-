"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteAiSettings,
  fetchAiSettings,
  fetchProviderModels,
  saveAiSettings,
  testAiConnection,
  type AiSettingsData,
} from "@/lib/client/api";

interface AiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigSaved?: () => void;
}

const COMMON_BASE_URLS = [
  { label: "DeepSeek 官方", url: "https://api.deepseek.com" },
  { label: "OpenAI 官方", url: "https://api.openai.com/v1" },
  { label: "Moonshot (Kimi)", url: "https://api.moonshot.cn/v1" },
  { label: "智谱 GLM", url: "https://open.bigmodel.cn/api/paas/v4" },
  { label: "硅基流动 (SiliconFlow)", url: "https://api.siliconflow.cn/v1" },
];

export function AiSettingsDialog({
  open,
  onOpenChange,
  onConfigSaved,
}: AiSettingsDialogProps) {
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [savedConfig, setSavedConfig] = useState<AiSettingsData | null>(null);

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    latencyMs: number;
    preview: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  // 打开弹窗时，从后端读取脱敏的真实配置
  useEffect(() => {
    if (!open) return;
    setStatusMsg(null);
    setTestResult(null);

    fetchAiSettings()
      .then((cfg) => {
        if (cfg) {
          setSavedConfig(cfg);
          if (typeof cfg.baseUrl === "string" && cfg.baseUrl) {
            setBaseUrl(cfg.baseUrl);
          }
          if (typeof cfg.model === "string" && cfg.model) {
            setModel(cfg.model);
          }
        } else {
          setSavedConfig(null);
        }
      })
      .catch(() => {});
  }, [open]);

  // 获取真实模型列表
  const handleFetchModels = async () => {
    const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
    const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";

    if (!normalizedBaseUrl) {
      setStatusMsg({ type: "error", text: "请填写 API 地址" });
      return;
    }
    if (!normalizedApiKey && !savedConfig?.apiKeyConfigured) {
      setStatusMsg({ type: "error", text: "首次拉取模型需要填写 API Key" });
      return;
    }

    setIsFetchingModels(true);
    setStatusMsg(null);
    try {
      const res = await fetchProviderModels({
        baseUrl: normalizedBaseUrl,
        apiKey: normalizedApiKey || undefined,
      });

      const modelList = res.models.map((m) => m.id);
      setAvailableModels(modelList);
      if (modelList.length > 0 && !modelList.includes(model)) {
        setModel(modelList[0]);
      }
      setStatusMsg({
        type: "success",
        text: `已从供应商成功拉取到 ${modelList.length} 个可用模型`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: "error",
        text: err instanceof Error ? err.message : "获取模型列表失败",
      });
    } finally {
      setIsFetchingModels(false);
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
    const normalizedModel = typeof model === "string" ? model.trim() : "";
    const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";

    if (!normalizedBaseUrl || !normalizedModel) {
      setStatusMsg({ type: "error", text: "请填写 API 地址并选择或填写模型名称" });
      return;
    }
    if (!normalizedApiKey && !savedConfig?.apiKeyConfigured) {
      setStatusMsg({ type: "error", text: "首次测试需要填写 API Key" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setStatusMsg(null);

    try {
      const res = await testAiConnection({
        baseUrl: normalizedBaseUrl,
        apiKey: normalizedApiKey || undefined,
        model: normalizedModel,
      });
      setTestResult({
        latencyMs: res.latencyMs,
        preview: res.responsePreview,
      });
      setStatusMsg({
        type: "success",
        text: `模型通信成功！响应耗时 ${res.latencyMs}ms`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: "error",
        text: err instanceof Error ? err.message : "连接测试失败，请核对地址与密钥",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
    const normalizedModel = typeof model === "string" ? model.trim() : "";
    const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";

    if (!normalizedBaseUrl || !normalizedModel) {
      setStatusMsg({ type: "error", text: "API 地址与模型为必填项" });
      return;
    }
    if (!normalizedApiKey && !savedConfig?.apiKeyConfigured) {
      setStatusMsg({ type: "error", text: "首次配置必须提供 API Key" });
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);
    try {
      const updated = await saveAiSettings({
        baseUrl: normalizedBaseUrl,
        model: normalizedModel,
        apiKey: normalizedApiKey || undefined,
      });
      setSavedConfig(updated);
      setApiKey(""); // 清理明文输入
      setStatusMsg({ type: "success", text: "AI 供应商配置已加密保存成功！" });
      onConfigSaved?.();
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err: unknown) {
      setStatusMsg({
        type: "error",
        text: err instanceof Error ? err.message : "保存配置失败",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 清除配置
  const handleDelete = async () => {
    if (!confirm("确定要删除已保存的 AI 密钥与配置吗？")) return;
    try {
      await deleteAiSettings();
      setSavedConfig(null);
      setApiKey("");
      setTestResult(null);
      setBaseUrl("https://api.deepseek.com");
      setModel("deepseek-chat");
      setStatusMsg({ type: "success", text: "AI 配置已清除" });
      onConfigSaved?.();
    } catch (err: unknown) {
      setStatusMsg({
        type: "error",
        text: err instanceof Error ? err.message : "清除配置失败",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#fffefb] border border-[#d8d6cd] rounded-3xl p-6 shadow-2xl space-y-3">
        <DialogHeader className="text-left space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#176b5b] text-white flex items-center justify-center shadow-xs">
                <Bot size={19} />
              </div>
              <div>
                <DialogTitle className="font-serif text-lg font-bold text-[#1f2c25]">
                  AI 大模型服务配置
                </DialogTitle>
                <DialogDescription className="text-secondary text-[#717b75]">
                  支持所有 OpenAI 兼容接口，服务端 AES-GCM 高度加密隔离。
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* 状态提示 */}
        {statusMsg && (
          <div
            className={`p-3 rounded-xl text-sm flex items-start gap-2 animate-fadeIn ${
              statusMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {statusMsg.type === "success" ? (
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="space-y-3.5 pt-1 text-sm">
          {/* API Base URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-[#2d3a33]">API Base URL</label>
              <div className="flex gap-1.5 overflow-x-auto">
                {COMMON_BASE_URLS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setBaseUrl(item.url)}
                    className="text-sm font-medium text-[#176b5b] hover:bg-[#d8ece4] bg-[#edf5f2] px-3 py-1 rounded-md cursor-pointer shrink-0 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
              className="w-full h-10 px-3 text-sm font-mono rounded-xl border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b]"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-[#2d3a33] flex items-center gap-1.5">
                <span>API Key</span>
                {savedConfig?.apiKeyConfigured && (
                  <span className="text-caption px-2 py-0.5 rounded-md bg-emerald-100/90 text-emerald-800 font-mono font-medium">
                    服务端已加密存储
                  </span>
                )}
              </label>
              {savedConfig && (
                <span className="text-caption text-[#86918a]">不修改可留空</span>
              )}
            </div>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={savedConfig?.apiKeyHint || "sk-••••••••••••••••"}
                className="w-full h-10 pl-9 pr-3 text-sm font-mono rounded-xl border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b]"
              />
              <KeyRound
                size={15}
                className="absolute left-3 top-3 text-[#919c96]"
              />
            </div>
          </div>

          {/* Model selection & fetching */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-[#2d3a33]">模型名称 (Model)</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isFetchingModels}
                onClick={handleFetchModels}
                className="h-8 px-2.5 text-sm text-[#176b5b] hover:bg-[#edf5f2] cursor-pointer flex items-center gap-1"
              >
                {isFetchingModels ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                <span>拉取供应商真实模型</span>
              </Button>
            </div>

            {availableModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-10 px-3 text-sm font-mono rounded-xl border border-[#176b5b] bg-[#f7fbf9] focus:outline-none"
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="例如：deepseek-chat 或 gpt-4.1-mini"
                className="w-full h-10 px-3 text-sm font-mono rounded-xl border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b]"
              />
            )}
          </div>

          {/* 测试连接反馈与极小 Token 消耗提示 */}
          <div className="p-3 rounded-2xl bg-[#faf9f5] border border-[#e6e4dc] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-caption text-[#6d7972] flex items-center gap-1">
                <ShieldCheck size={13} className="text-[#176b5b]" />
                测试将通过服务端向模型发送微量探测请求（约消耗 15 Tokens）
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTesting}
                onClick={handleTestConnection}
                className="h-8 px-3 text-sm rounded-lg border-[#bad4cb] text-[#176b5b] hover:bg-[#edf5f2] cursor-pointer"
              >
                {isTesting ? (
                  <Loader2 size={13} className="animate-spin mr-1" />
                ) : (
                  <Sparkles size={13} className="mr-1" />
                )}
                <span>测试模型连接</span>
              </Button>
            </div>

            {testResult && (
              <div className="pt-2 border-t border-[#eeece6] text-caption space-y-1">
                <div className="flex items-center justify-between text-[#2d3a33]">
                  <span>🟢 模型响应成功（延迟：{testResult.latencyMs}ms）</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#e2e0d7] font-mono text-[#526058] line-clamp-2">
                  &ldquo;{testResult.preview}&rdquo;
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
          {savedConfig ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="h-8 px-3 text-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700 cursor-pointer flex items-center gap-1"
            >
              <Trash2 size={13} />
              <span>删除已存配置</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-10 px-3 text-sm text-[#717b75] cursor-pointer"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={handleSave}
              className="h-10 px-5 bg-[#176b5b] hover:bg-[#12594b] text-white text-sm font-medium rounded-xl cursor-pointer shadow-md shadow-[#176b5b]/20"
            >
              {isSaving ? "正在加密保存..." : "加密保存配置"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
