"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { ACCOUNT_DELETE_CONFIRMATION } from "@/contracts/auth";
import { authService } from "@/lib/client/auth";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountDeletionDialog({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword("");
    setConfirmation("");
    setUnderstood(false);
    setStatus("idle");
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (status === "deleting") return;
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const canDelete =
    status !== "deleting" &&
    password.length > 0 &&
    confirmation === ACCOUNT_DELETE_CONFIRMATION &&
    understood;

  const deleteAccount = async () => {
    if (!canDelete) return;
    setStatus("deleting");
    setError(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: password, confirmation }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: { deleted?: boolean }; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.data?.deleted) {
        throw new Error(payload?.error?.message ?? `账号删除失败（${response.status}）`);
      }
      await authService.logout();
      router.replace("/login?accountDeleted=1");
      router.refresh();
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "账号删除失败，数据未被更改");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="h-8 text-xs">
          永久删除账号
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-red-200 bg-[#fffefb] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-800">
            <TriangleAlert className="size-5" />
            永久删除账号与全部作品
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left leading-6">
            此操作立即生效且无法撤销。账号资料、全部作品、章节、设定、历史版本、AI 配置、用量记录和所有登录会话都会永久删除。建议先下载完整账号备份。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
          <p className="text-xs leading-5 text-red-800">
            正在删除：<strong>{email}</strong>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="delete-account-password" className="text-xs text-red-900">
              输入当前密码
            </Label>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={status === "deleting"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delete-account-confirmation" className="text-xs text-red-900">
              输入“{ACCOUNT_DELETE_CONFIRMATION}”确认
            </Label>
            <Input
              id="delete-account-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={status === "deleting"}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-red-900">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              disabled={status === "deleting"}
              className="mt-1"
            />
            <span>我明白备份不会自动生成，删除后平台无法恢复账号和作品。</span>
          </label>
          {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={status === "deleting"}>取消</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!canDelete}
            onClick={() => void deleteAccount()}
          >
            {status === "deleting" ? "正在永久删除…" : "确认永久删除"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
