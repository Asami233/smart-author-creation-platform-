"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  BACKUP_RESTORE_MODE,
  type BackupDocument,
  type BackupImportPreflightResult,
  type BackupImportResult,
} from "@/contracts/data-safety";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

type ErrorPayload = { error?: { message?: string; details?: unknown } };

function errorMessage(payload: ErrorPayload | null, fallback: string): string {
  const detail = payload?.error?.details;
  if (Array.isArray(detail) && typeof detail[0] === "string") return `${payload?.error?.message ?? fallback}：${detail[0]}`;
  return payload?.error?.message ?? fallback;
}

export function BackupRestoreDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [backup, setBackup] = useState<BackupDocument | null>(null);
  const [preflight, setPreflight] = useState<BackupImportPreflightResult | null>(null);
  const [result, setResult] = useState<BackupImportResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "ready" | "importing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = status === "checking" || status === "importing";

  const reset = () => {
    setFileName("");
    setBackup(null);
    setPreflight(null);
    setResult(null);
    setConfirmed(false);
    setStatus("idle");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    if (!next) reset();
  };

  const inspectFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_BACKUP_BYTES) {
      setStatus("error");
      setError("备份文件不能超过 25 MB");
      return;
    }
    setStatus("checking");
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const candidate = parsed.format === "smart-author-account-export" && parsed.content
        ? parsed.content
        : parsed;
      const response = await fetch("/api/backup/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(candidate),
      });
      const payload = await response.json().catch(() => null) as
        | { data?: BackupImportPreflightResult; error?: ErrorPayload["error"] }
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(errorMessage(payload, `备份预检失败（${response.status}）`));
      }
      setBackup(candidate as BackupDocument);
      setPreflight(payload.data);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "无法读取这个备份文件");
    }
  };

  const restore = async () => {
    if (!backup || !preflight || !confirmed || busy) return;
    setStatus("importing");
    setError(null);
    try {
      const response = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          backup,
          previewToken: preflight.previewToken,
          mode: BACKUP_RESTORE_MODE,
          confirm: true,
        }),
      });
      const payload = await response.json().catch(() => null) as
        | { data?: BackupImportResult; error?: ErrorPayload["error"] }
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(errorMessage(payload, `恢复失败（${response.status}）`));
      }
      setResult(payload.data);
      setStatus("done");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "恢复失败，未确认的数据不会被覆盖");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full h-11 rounded-xl border-[#cfd9d4] bg-white text-[#176b5b] text-xs"
      >
        <FileUp className="size-4" />
        从 JSON 备份安全恢复
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-[#dedcd4] bg-[#fffefb] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#202923]">备份预检与安全恢复</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            先检查文件和同名作品，再以“合并副本”模式恢复。现有作品不会被覆盖、删除或合并。
          </DialogDescription>
        </DialogHeader>

        {status !== "done" && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-[#aabdb4] bg-[#f6f9f7] px-4 py-6 text-center">
              <FileUp className="size-6 text-[#176b5b]" />
              <span className="text-sm font-medium text-[#25332d]">选择 smart-author JSON 备份</span>
              <span className="text-[11px] text-[#75817b]">也支持账号完整导出文件；最大 25 MB</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                disabled={busy}
                onChange={(event) => void inspectFile(event.target.files?.[0])}
              />
            </label>
            {fileName && <p className="text-xs text-[#59655f]">当前文件：{fileName}</p>}
            {status === "checking" && <p role="status" className="text-xs text-[#176b5b]">正在检查格式、关联和现有作品…</p>}
            {error && <Alert variant="destructive"><AlertTriangle /><AlertTitle>无法继续</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

            {preflight && backup && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["作品", preflight.summary.workCount],
                    ["章节", preflight.summary.chapterCount],
                    ["设定", preflight.summary.knowledgeCount],
                    ["字数", preflight.summary.totalWords],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[#e0e5e1] bg-white p-3 text-center">
                      <strong className="block text-base text-[#176b5b]">{Number(value).toLocaleString("zh-CN")}</strong>
                      <span className="text-[11px] text-[#75817b]">{label}</span>
                    </div>
                  ))}
                </div>

                <Alert>
                  <CheckCircle2 />
                  <AlertTitle>恢复方式：创建独立副本</AlertTitle>
                  <AlertDescription>
                    将新建 {preflight.summary.workCount} 部作品和对应内容；当前账号已有 {preflight.existingWorkCount} 部作品，任何现有正文都不会被改写。
                  </AlertDescription>
                </Alert>

                {preflight.titleConflicts.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <h4 className="text-xs font-semibold text-amber-900">发现 {preflight.titleConflicts.length} 个同名作品</h4>
                    <ul className="mt-2 space-y-1 text-xs text-amber-800">
                      {preflight.titleConflicts.slice(0, 10).map((conflict) => (
                        <li key={conflict.sourceWorkId}>《{conflict.sourceTitle}》将作为新副本恢复，不覆盖现有同名作品。</li>
                      ))}
                    </ul>
                  </div>
                )}

                {preflight.warnings.length > 0 && (
                  <ul className="space-y-1 rounded-xl bg-[#f5f4ef] p-4 text-xs leading-5 text-[#626b66]">
                    {preflight.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                  </ul>
                )}

                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#d8ded9] p-3 text-xs leading-5 text-[#394640]">
                  <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
                  <span>我已核对数量和警告，同意以独立副本方式恢复；我理解不会覆盖现有作品。</span>
                </label>
              </div>
            )}
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-4 py-3 text-center">
            <CheckCircle2 className="mx-auto size-12 text-[#176b5b]" />
            <div>
              <h3 className="font-serif text-xl font-bold text-[#202923]">{result.alreadyImported ? "这份备份已恢复过" : "恢复完成"}</h3>
              <p className="mt-2 text-xs leading-5 text-[#69746e]">
                {result.alreadyImported ? "没有重复创建作品，已返回上次恢复结果。" : `已创建 ${result.importedWorkIds.length} 部独立作品副本。`}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {status === "done" ? (
            <>
              <Button variant="outline" onClick={reset}><RotateCcw className="size-4" />继续恢复其他备份</Button>
              <Button onClick={() => router.push("/")} className="bg-[#176b5b] hover:bg-[#13594b]">返回工作台</Button>
            </>
          ) : (
            <Button
              disabled={!preflight || !backup || !confirmed || busy}
              onClick={() => void restore()}
              className="bg-[#176b5b] hover:bg-[#13594b]"
            >
              {status === "importing" ? "正在安全恢复…" : preflight?.alreadyImported ? "查看上次恢复结果" : "确认恢复为独立副本"}
            </Button>
          )}
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
