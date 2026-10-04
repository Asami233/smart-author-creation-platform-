"use client";

import { useCallback, useEffect, useState } from "react";
import { DocumentLink as Link } from "@/components/navigation/document-link";
import { ArrowLeft, CheckCircle2, Laptop, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import type { AuthDeviceSession, RevokeAuthSessionResult } from "@/contracts";

async function apiError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return payload?.error?.message ?? `请求失败（${response.status}）`;
}

function localDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知时间" : date.toLocaleString("zh-CN", { hour12: false });
}

export function SessionManager() {
  const [sessions, setSessions] = useState<AuthDeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sessions", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(await apiError(response));
      const payload = await response.json() as { data: AuthDeviceSession[] };
      setSessions(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取登录会话");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/sessions", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response));
        return response.json() as Promise<{ data: AuthDeviceSession[] }>;
      })
      .then((payload) => { if (active) setSessions(payload.data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "无法读取登录会话"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function revoke(sessionId: string) {
    setRevokingId(sessionId);
    setError(null);
    try {
      const response = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!response.ok) throw new Error(await apiError(response));
      const payload = await response.json() as { data: RevokeAuthSessionResult };
      if (payload.data.revoked) setSessions((current) => current.filter((item) => item.id !== sessionId));
      setConfirmingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "撤销会话失败");
    } finally { setRevokingId(null); }
  }

  return (
    <main className="min-h-screen bg-[#f4f2ed] px-5 py-8 text-[#202923]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#56615b] hover:text-[#176b5b]"><ArrowLeft size={16} /> 返回工作台</Link>
        <section className="mt-8 rounded-2xl border border-[#dedfd9] bg-[#fffefb] p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-[#e5eeea] p-2 text-[#176b5b]"><ShieldCheck size={24} /></span>
              <div><p className="text-xs font-medium text-[#176b5b]">账号安全</p><h1 className="font-serif text-2xl font-semibold">登录设备与会话</h1></div>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-[#176b5b] hover:bg-[#eef3f0] disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 刷新</button>
          </div>
          <p className="mt-4 text-sm leading-7 text-[#56615b]">这里列出仍有效的登录会话。发现不认识的会话时可以撤销；当前设备请通过账号菜单正常退出。</p>
          {error && <p role="alert" className="mt-5 rounded-lg border border-[#e7c2b8] bg-[#fff4f1] p-3 text-sm text-[#9b3d2f]">{error}</p>}
          {loading && sessions.length === 0 ? <p className="mt-8 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> 正在读取会话…</p> : (
            <ul className="mt-6 space-y-3">
              {sessions.map((session) => (
                <li key={session.id} className="rounded-xl border border-[#e3e4df] bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <span className="mt-0.5 rounded-lg bg-[#eef3f0] p-2 text-[#176b5b]"><Laptop size={18} /></span>
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold">{session.current ? "当前设备" : "其他登录会话"}{session.current && <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f4ed] px-2 py-0.5 text-[11px] text-[#176b5b]"><CheckCircle2 size={11} /> 正在使用</span>}</p>
                        <p className="mt-1 text-xs leading-5 text-[#68716c]">创建：{localDate(session.createdAt)}<br />最近活动：{localDate(session.lastSeenAt)} · 到期：{localDate(session.expiresAt)}</p>
                      </div>
                    </div>
                    {!session.current && (confirmingId === session.id ? (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => setConfirmingId(null)} className="rounded-lg px-3 py-2 text-xs text-[#56615b] hover:bg-[#f1f1ed]">取消</button>
                        <button type="button" onClick={() => void revoke(session.id)} disabled={revokingId === session.id} className="inline-flex items-center gap-1 rounded-lg bg-[#a63d32] px-3 py-2 text-xs font-medium text-white disabled:opacity-60">{revokingId === session.id && <Loader2 size={13} className="animate-spin" />}确认撤销</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmingId(session.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs text-[#a63d32] hover:bg-[#fff0ed]"><LogOut size={14} /> 撤销</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
