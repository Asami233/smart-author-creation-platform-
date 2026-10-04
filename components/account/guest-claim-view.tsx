"use client";

import { useCallback, useEffect, useState } from "react";
import { DocumentLink as Link } from "@/components/navigation/document-link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import type { GuestClaimPreview, GuestClaimResult } from "@/contracts";

type Phase = "loading" | "ready" | "downloading" | "claiming" | "done";

async function readApiError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return payload?.error?.message ?? `请求失败（${response.status}）`;
}

async function fetchPreview(): Promise<GuestClaimPreview> {
  const response = await fetch("/api/guest-claim/preview", { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json() as { data: GuestClaimPreview };
  return payload.data;
}

export function GuestClaimView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<GuestClaimPreview | null>(null);
  const [downloadedToken, setDownloadedToken] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<GuestClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setDownloadedToken(null);
    setConfirmed(false);
    try {
      setPreview(await fetchPreview());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取访客作品");
    } finally {
      setPhase("ready");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPreview()
      .then((data) => { if (active) setPreview(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "无法读取访客作品"); })
      .finally(() => { if (active) setPhase("ready"); });
    return () => { active = false; };
  }, []);

  async function downloadBackup() {
    if (!preview?.previewToken) return;
    setPhase("downloading");
    setError(null);
    try {
      const response = await fetch("/api/guest-claim/backup", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response));
      const token = response.headers.get("x-guest-claim-preview-token");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `smart-author-guest-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      if (token !== preview.previewToken) {
        await refresh();
        setError("访客作品在预览后发生变化。备份已下载，请核对最新清单并重新下载后认领。");
        return;
      }
      setDownloadedToken(token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "备份下载失败");
    } finally {
      setPhase("ready");
    }
  }

  async function claim() {
    if (!preview?.previewToken || downloadedToken !== preview.previewToken || !confirmed) return;
    setPhase("claiming");
    setError(null);
    try {
      const response = await fetch("/api/guest-claim", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workIds: preview.works.map((work) => work.id),
          previewToken: preview.previewToken,
          confirm: true,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = await response.json() as { data: GuestClaimResult };
      setResult(payload.data);
      setPhase("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "认领未完成，请核对后重试");
      setPhase("ready");
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f2ed] px-5 py-8 text-[#202923]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#56615b] hover:text-[#176b5b]">
          <ArrowLeft size={16} /> 返回工作台
        </Link>
        <div className="mt-8 rounded-2xl border border-[#dedfd9] bg-[#fffefb] p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-[#e5eeea] p-2 text-[#176b5b]"><ShieldCheck size={24} /></span>
            <div>
              <p className="text-xs font-medium text-[#176b5b]">本机数据迁移</p>
              <h1 className="font-serif text-2xl font-semibold">认领访客作品</h1>
            </div>
          </div>
          <p className="mt-4 text-sm leading-7 text-[#56615b]">
            将当前电脑里以访客身份创作的全部作品转入已登录邮箱账号。作品正文、设定、历史版本和统计保持原样；
            认领后访客身份不再能打开这些作品。请先保存其他正在编辑的访客标签页。
          </p>

          {phase === "loading" && <p className="mt-8 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16} /> 正在检查作品…</p>}
          {error && <p role="alert" className="mt-5 rounded-lg border border-[#e7c2b8] bg-[#fff4f1] p-3 text-sm text-[#9b3d2f]">{error}</p>}
          {phase === "done" && result && (
            <div className="mt-7 rounded-xl border border-[#b7d7c8] bg-[#f0f8f3] p-5">
              <p className="flex items-center gap-2 font-semibold text-[#176b5b]"><CheckCircle2 size={20} />{result.alreadyClaimed ? "这些作品已认领" : "认领完成"}</p>
              <p className="mt-2 text-sm">{result.claimedWorkIds.length} 部作品已属于当前邮箱账号。请返回工作台刷新作品列表。</p>
              <Link href="/" className="mt-4 inline-block rounded-lg bg-[#176b5b] px-4 py-2 text-sm font-medium text-white">进入工作台</Link>
            </div>
          )}

          {phase !== "loading" && phase !== "done" && preview && (
            <>
              <div className="mt-7 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">待认领清单 · {preview.works.length} 部</h2>
                  <p className="mt-1 text-xs text-[#68716c]">目标账号：{preview.accountEmail}</p>
                </div>
                <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-[#176b5b] hover:bg-[#eef3f0]"><RefreshCw size={14} /> 重新检查</button>
              </div>
              {preview.works.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-[#d8dcd8] p-8 text-center text-sm text-[#68716c]">当前本机没有访客作品需要认领。</p>
              ) : (
                <>
                  <ul className="mt-4 divide-y divide-[#e8e8e2] overflow-hidden rounded-xl border border-[#e4e5df]">
                    {preview.works.map((work) => (
                      <li key={work.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                        <span className="min-w-0 truncate font-medium">{work.title}</span>
                        <span className="shrink-0 text-xs text-[#68716c]">{work.status === "archived" ? "已归档 · " : ""}{work.chapterCount} 章 · {work.totalWords.toLocaleString()} 字</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 rounded-xl border border-[#e8dcb9] bg-[#fffaf0] p-4 text-sm leading-6 text-[#685534]">
                    <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={17} /> 先备份，再认领</p>
                    <p className="mt-2">下载的 JSON 包含正文与设定，请保存在你信任的位置。备份不包含 AI 密钥；账号原有作品不受影响。</p>
                  </div>
                  <button type="button" disabled={phase !== "ready"} onClick={() => void downloadBackup()} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#a9c9bb] bg-white px-4 py-2.5 text-sm font-medium text-[#176b5b] hover:bg-[#f0f7f3] disabled:opacity-60">
                    {phase === "downloading" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    下载访客作品备份
                  </button>
                  {downloadedToken === preview.previewToken && <p className="mt-2 text-xs text-[#176b5b]">备份下载已发起。请确认文件确实保存在本机后再继续。</p>}
                  <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm leading-6">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={downloadedToken !== preview.previewToken} className="mt-1 accent-[#176b5b]" />
                    <span>我已确认备份文件保存成功，并同意将以上全部访客作品转入 <strong>{preview.accountEmail}</strong>。</span>
                  </label>
                  <button type="button" disabled={phase !== "ready" || !confirmed || downloadedToken !== preview.previewToken || preview.works.length > 500} onClick={() => void claim()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#176b5b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#13594b] disabled:cursor-not-allowed disabled:opacity-50">
                    {phase === "claiming" && <Loader2 size={16} className="animate-spin" />} 确认认领全部作品
                  </button>
                  {preview.works.length > 500 && <p className="mt-2 text-xs text-[#9b3d2f]">当前超过一次认领的 500 部上限，请联系开发者处理。</p>}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
