"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Feather,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/client/auth";

type Mode = "password-login" | "code-login" | "register" | "forgot-password";

export function AuthCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";

  const {
    loginWithPassword,
    startEmailLoginCode,
    verifyEmailLoginCode,
    startEmailRegister,
    verifyEmailRegister,
    startPasswordReset,
    confirmPasswordReset,
    loginAsGuest,
  } = useAuth();

  // 主模式
  const [mode, setMode] = useState<Mode>("password-login");

  // 表单字段
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [penName, setPenName] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // 注册/重置两步流程控制
  const [step, setStep] = useState<"input" | "verify">("input");
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);

  // 倒计时与加载状态
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // 倒计时控制
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // 触发抖动提示
  const triggerShake = (msg: string) => {
    setErrorMessage(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // 切换模式时重置部分瞬态
  const handleSwitchMode = (target: Mode) => {
    setMode(target);
    setStep("input");
    setErrorMessage(null);
    setSuccessInfo(null);
    setDevCodeHint(null);
    setCode("");
  };

  // 密码复杂度分析
  const hasMinLength = password.length >= 8 && password.length <= 128;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const isPasswordValid = hasMinLength && hasLetter && hasNumber;

  let passwordStrength = 0;
  if (password.length >= 8) passwordStrength += 1;
  if (hasLetter && hasNumber) passwordStrength += 1;
  if (password.length >= 12 && /[^A-Za-z0-9]/.test(password)) passwordStrength += 1;

  // 1. 密码登录提交
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      triggerShake("请输入合法的作者邮箱地址");
      return;
    }
    if (!password) {
      triggerShake("请输入登录密码");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await loginWithPassword(email, password);
      setIsSuccess(true);
      setSuccessInfo("登录成功，正在进入书卷世界…");
      setTimeout(() => router.push(returnTo), 500);
    } catch (err) {
      triggerShake(err instanceof Error ? err.message : "邮箱或密码错误");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 免密登录 - 发送验证码
  const handleSendLoginCode = async () => {
    if (!email.trim() || !email.includes("@")) {
      triggerShake("请输入要接收验证码的邮箱地址");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await startEmailLoginCode(email);
      setCountdown(res.retryAfterSeconds || 60);
      setSuccessInfo("验证码已发送，请查收邮箱");
      if (res.devCode) {
        setDevCodeHint(res.devCode);
        setCode(res.devCode);
      }
    } catch (err) {
      triggerShake(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 3. 免密登录 - 提交验证
  const handleCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      triggerShake("请输入邮箱");
      return;
    }
    if (!code.trim() || code.trim().length !== 6) {
      triggerShake("请输入6位数字验证码");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await verifyEmailLoginCode(email, code);
      setIsSuccess(true);
      setSuccessInfo("验证成功，正在开启工作台…");
      setTimeout(() => router.push(returnTo), 500);
    } catch (err) {
      triggerShake(err instanceof Error ? err.message : "验证码错误或已过期");
    } finally {
      setIsLoading(false);
    }
  };

  // 4. 注册 - 发送验证码进入第二步
  const handleRegisterStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      triggerShake("请输入合法的作者电子邮箱");
      return;
    }
    if (!penName.trim()) {
      triggerShake("请设置您的作者笔名");
      return;
    }
    if (!isPasswordValid) {
      triggerShake("密码必须在8位以上，且同时包含字母与数字");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await startEmailRegister(email, password, penName);
      setCountdown(res.retryAfterSeconds || 60);
      setStep("verify");
      setSuccessInfo("验证码已发送至您的邮箱");
      if (res.devCode) {
        setDevCodeHint(res.devCode);
        setCode(res.devCode);
      }
    } catch (err) {
      triggerShake(err instanceof Error ? err.message : "注册请求发起失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 5. 注册 - 验证并完成注册
  const handleRegisterVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.trim().length !== 6) {
      triggerShake("请输入6位验证码");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await verifyEmailRegister(email, code);
      setIsSuccess(true);
      setSuccessInfo("作者账号注册成功，即刻落笔成卷！");
      setTimeout(() => router.push(returnTo), 600);
    } catch (err) {
      triggerShake(err instanceof Error ? err.message : "验证码无效或已失效");
    } finally {
      setIsLoading(false);
    }
  };

  // 6. 找回密码流程
  const handleForgotStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      triggerShake("请输入要重置密码的邮箱");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await startPasswordReset(email);
      setCountdown(res.retryAfterSeconds || 60);
      setStep("verify");
      setSuccessInfo("重置验证码已发送");
      if (res.devCode) {
        setDevCodeHint(res.devCode);
        setCode(res.devCode);
      }
    } catch (err) {
      triggerShake(err instanceof Error ? err.message : "发送重置码失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.trim().length !== 6) {
      triggerShake("请输入6位验证码");
      return;
    }
    const hasNewLetter = /[A-Za-z]/.test(newPassword);
    const hasNewNumber = /\d/.test(newPassword);
    if (newPassword.length < 8 || !hasNewLetter || !hasNewNumber) {
      triggerShake("新密码必须至少8位且同时包含字母与数字");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await confirmPasswordReset(email, code, newPassword);
      setSuccessInfo("密码重置成功，请使用新密码登录");
      setTimeout(() => {
        handleSwitchMode("password-login");
      }, 1000);
    } catch (err) {
      triggerShake(err instanceof Error ? err.message : "密码重置失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 7. 游客快捷进入
  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      await loginAsGuest();
      setIsSuccess(true);
      setSuccessInfo("已为您开启快捷免登录体验…");
      setTimeout(() => router.push(returnTo), 400);
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div
      className={`w-full max-w-md bg-[#fffefb]/95 backdrop-blur-md rounded-3xl border border-[#dedcd4] shadow-2xl p-6 sm:p-8 transition-all duration-300 relative overflow-hidden ${
        isShaking ? "animate-auth-shake" : ""
      }`}
    >
      {/* 装饰水墨光效 */}
      <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-[#176b5b]/10 blur-2xl pointer-events-none animate-ink-pulse-glow" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-[#4a9b87]/10 blur-2xl pointer-events-none" />

      {/* 顶部标题区 */}
      <div className="text-center mb-6 relative z-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#176b5b] to-[#258270] text-white shadow-md shadow-[#176b5b]/25 mb-3 animate-ink-float">
          <Feather className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-serif font-bold text-[#1e2621]">
          {mode === "register"
            ? "注册作者账号"
            : mode === "forgot-password"
            ? "找回登录密码"
            : "欢迎归案 · 作者登录"}
        </h2>
        <p className="text-xs text-[#758079] mt-1">
          {mode === "register"
            ? "开启云端备份与数据安全隔离 · 见证百万字传奇"
            : mode === "forgot-password"
            ? "通过已绑定的电子邮箱重设密码"
            : "以邮箱验证身份 · 畅享沉浸式网络文学长卷创作"}
        </p>
      </div>

      {/* 主模式切换 Tab（在非找回密码模式下展示） */}
      {mode !== "forgot-password" && (
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#eceae3] rounded-xl mb-5 text-xs font-medium relative z-10">
          <button
            type="button"
            onClick={() => handleSwitchMode("password-login")}
            className={`py-2 rounded-lg transition-all text-center ${
              mode === "password-login"
                ? "bg-[#fffefb] text-[#176b5b] font-bold shadow-xs"
                : "text-[#626e67] hover:text-[#202923]"
            }`}
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode("code-login")}
            className={`py-2 rounded-lg transition-all text-center ${
              mode === "code-login"
                ? "bg-[#fffefb] text-[#176b5b] font-bold shadow-xs"
                : "text-[#626e67] hover:text-[#202923]"
            }`}
          >
            免密验证码
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode("register")}
            className={`py-2 rounded-lg transition-all text-center ${
              mode === "register"
                ? "bg-[#fffefb] text-[#176b5b] font-bold shadow-xs"
                : "text-[#626e67] hover:text-[#202923]"
            }`}
          >
            注册账号
          </button>
        </div>
      )}

      {/* 提示与状态展示 */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-center gap-2 animate-fadeIn">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successInfo && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 animate-success-pop" />
          <span>{successInfo}</span>
        </div>
      )}

      {/* 本地开发环境智能验证码辅助条 */}
      {devCodeHint && (
        <div className="mb-4 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>本地调试验证码：</span>
            <code className="font-mono font-bold tracking-widest bg-amber-200/60 px-1.5 py-0.5 rounded text-amber-950">
              {devCodeHint}
            </code>
          </div>
          <button
            type="button"
            onClick={() => setCode(devCodeHint)}
            className="text-[11px] font-semibold text-[#176b5b] hover:underline"
          >
            一键填入
          </button>
        </div>
      )}

      {/* 表单渲染区域 */}
      <div className="relative z-10">
        {/* 1. 邮箱密码登录 */}
        {mode === "password-login" && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#176b5b]" />
                <span>电子邮箱</span>
              </Label>
              <Input
                type="email"
                placeholder="writer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 bg-white/80 border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#176b5b]" />
                  <span>登录密码</span>
                </Label>
                <button
                  type="button"
                  onClick={() => handleSwitchMode("forgot-password")}
                  className="text-[11px] text-[#717b75] hover:text-[#176b5b] transition-colors"
                >
                  忘记密码？
                </button>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入您的登录密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 pr-10 bg-white/80 border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#98a19c] hover:text-[#424c46]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || isSuccess}
              className="w-full h-10 bg-[#176b5b] hover:bg-[#12584a] text-white font-medium shadow-md shadow-[#176b5b]/20 transition-all rounded-xl mt-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>正在验证身份…</span>
                </>
              ) : isSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  <span>登录成功</span>
                </>
              ) : (
                <>
                  <span>登录作者工作台</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>
        )}

        {/* 2. 邮箱免密登录 */}
        {mode === "code-login" && (
          <form onSubmit={handleCodeLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#176b5b]" />
                <span>电子邮箱</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="writer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 bg-white/80 border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={countdown > 0 || isLoading}
                  onClick={handleSendLoginCode}
                  className="h-10 text-xs px-3 whitespace-nowrap border-[#d8d6cc] hover:bg-[#edf4f1] hover:text-[#176b5b] transition-colors"
                >
                  {countdown > 0 ? `${countdown}s 后重发` : "获取验证码"}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#176b5b]" />
                <span>6位邮箱验证码</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位数字验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-10 font-mono tracking-widest text-center text-sm bg-white/80 border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || isSuccess}
              className="w-full h-10 bg-[#176b5b] hover:bg-[#12584a] text-white font-medium shadow-md shadow-[#176b5b]/20 transition-all rounded-xl mt-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>正在验证验证码…</span>
                </>
              ) : isSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  <span>验证成功</span>
                </>
              ) : (
                <>
                  <span>立即验证并进入</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>
        )}

        {/* 3. 邮箱注册流程 */}
        {mode === "register" && step === "input" && (
          <form onSubmit={handleRegisterStart} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#176b5b]" />
                <span>电子邮箱（用于登录与密保）</span>
              </Label>
              <Input
                type="email"
                placeholder="writer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 bg-white/80 border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#176b5b]" />
                <span>作者笔名</span>
              </Label>
              <Input
                type="text"
                placeholder="如：沈砚、青石居士"
                value={penName}
                onChange={(e) => setPenName(e.target.value)}
                required
                maxLength={40}
                className="h-10 bg-white/80 border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#176b5b]" />
                <span>设置登录密码（8-128位，需包含字母与数字）</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入安全密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 pr-10 bg-white/80 border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#98a19c] hover:text-[#424c46]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* 动态密码强度指示条 */}
              {password.length > 0 && (
                <div className="pt-1 space-y-1 animate-fadeIn">
                  <div className="h-1 w-full bg-[#e8e6df] rounded-full overflow-hidden flex gap-0.5">
                    <div
                      className={`h-full transition-all duration-300 ${
                        passwordStrength >= 1 ? "bg-amber-500 w-1/3" : "w-0"
                      }`}
                    />
                    <div
                      className={`h-full transition-all duration-300 ${
                        passwordStrength >= 2 ? "bg-emerald-500 w-1/3" : "w-0"
                      }`}
                    />
                    <div
                      className={`h-full transition-all duration-300 ${
                        passwordStrength >= 3 ? "bg-emerald-600 w-1/3" : "w-0"
                      }`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#7a857e]">
                    <span className="flex items-center gap-1">
                      <span className={hasMinLength ? "text-emerald-600 font-bold" : ""}>
                        {hasMinLength ? "✓" : "○"} 8位以上
                      </span>
                      <span className={hasLetter ? "text-emerald-600 font-bold" : ""}>
                        {hasLetter ? "✓" : "○"} 含字母
                      </span>
                      <span className={hasNumber ? "text-emerald-600 font-bold" : ""}>
                        {hasNumber ? "✓" : "○"} 含数字
                      </span>
                    </span>
                    <span className="font-medium">
                      {passwordStrength === 1 ? "弱" : passwordStrength === 2 ? "中等" : "强"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !isPasswordValid}
              className="w-full h-10 bg-[#176b5b] hover:bg-[#12584a] text-white font-medium shadow-md shadow-[#176b5b]/20 transition-all rounded-xl mt-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>正在发起注册…</span>
                </>
              ) : (
                <>
                  <span>获取邮箱验证码并继续</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>
        )}

        {/* 注册第二步：验证邮箱 */}
        {mode === "register" && step === "verify" && (
          <form onSubmit={handleRegisterVerify} className="space-y-4">
            <div className="p-3 bg-[#edf5f2] rounded-xl text-xs text-[#2b4c42] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">验证码已发送至：</span>
                <button
                  type="button"
                  onClick={() => setStep("input")}
                  className="text-[#176b5b] hover:underline"
                >
                  修改邮箱
                </button>
              </div>
              <p className="font-mono text-[11px] text-[#4d7065]">{email}</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[#525f58] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#176b5b]" />
                  <span>输入 6 位邮箱验证码</span>
                </Label>
                {countdown > 0 ? (
                  <span className="text-[11px] text-[#8e9892]">{countdown}s 后可重发</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRegisterStart}
                    className="text-[11px] text-[#176b5b] hover:underline font-medium"
                  >
                    重新发送
                  </button>
                )}
              </div>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位数字验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                className="h-11 font-mono tracking-widest text-center text-base bg-white border-[#d8d6cc] focus-visible:ring-1 focus-visible:ring-[#176b5b] focus-visible:border-[#176b5b]"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || isSuccess}
              className="w-full h-10 bg-[#176b5b] hover:bg-[#12584a] text-white font-medium shadow-md shadow-[#176b5b]/20 transition-all rounded-xl mt-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>正在创建作者主页…</span>
                </>
              ) : isSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  <span>注册成功</span>
                </>
              ) : (
                <>
                  <span>完成验证 · 开启笔耕</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>
        )}

        {/* 4. 忘记密码流程 */}
        {mode === "forgot-password" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => handleSwitchMode("password-login")}
              className="inline-flex items-center gap-1.5 text-xs text-[#637069] hover:text-[#176b5b] mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回密码登录</span>
            </button>

            {step === "input" ? (
              <form onSubmit={handleForgotStart} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#525f58]">输入注册邮箱</Label>
                  <Input
                    type="email"
                    placeholder="writer@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-10 bg-white/80 border-[#d8d6cc]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 bg-[#176b5b] hover:bg-[#12584a] text-white rounded-xl cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "发送重置验证码"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleForgotVerify} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#525f58]">6 位验证码</Label>
                  <Input
                    type="text"
                    maxLength={6}
                    placeholder="验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    className="h-10 text-center font-mono tracking-widest bg-white/80 border-[#d8d6cc]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#525f58]">设置新密码</Label>
                  <Input
                    type="password"
                    placeholder="8位以上，含字母与数字"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="h-10 bg-white/80 border-[#d8d6cc]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 bg-[#176b5b] hover:bg-[#12584a] text-white rounded-xl cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认重设密码"}
                </Button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* 底部隔离线与快捷游客体验通道 */}
      <div className="mt-6 pt-5 border-t border-[#dedcd4] relative z-10 text-center space-y-3">
        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={guestLoading}
          className="inline-flex items-center justify-center gap-1.5 text-xs text-[#526058] hover:text-[#176b5b] py-1.5 px-3 rounded-lg hover:bg-[#eceae3] transition-all font-medium cursor-pointer"
        >
          {guestLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-[#176b5b]" />
          )}
          <span>免登录体验 · 快速进入离线创作演示</span>
        </button>

        <div className="flex items-center justify-center gap-4 text-[11px] text-[#97a19c]">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#176b5b]" />
            HttpOnly 安全会话
          </span>
          <span>·</span>
          <span>独立作品数据隔离</span>
        </div>
      </div>
    </div>
  );
}
