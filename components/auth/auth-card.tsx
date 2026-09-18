"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Feather,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  User,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/client/auth";

type AuthMode = "password-login" | "code-login" | "register";

export function AuthCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";

  const { loginWithPassword, loginWithCode, register, loginAsGuest, sendVerificationCode } = useAuth();

  // 当前主 Tab: "login" 或 "register"
  const [mainTab, setMainTab] = useState<"login" | "register">("login");
  // 登录子方式: "password" 或 "code"
  const [loginMethod, setLoginMethod] = useState<"password" | "code">("password");

  // 表单输入项
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [phoneOrEmail, setPhoneOrEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [countdown, setCountdown] = useState(0);

  const [regPenName, setRegPenName] = useState("");
  const [regAccount, setRegAccount] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regAgreement, setRegAgreement] = useState(true);

  // 交互状态
  const [isLoading, setIsLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // 倒计时计时器
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // 发送验证码
  const handleSendCode = async () => {
    if (!phoneOrEmail.trim()) {
      setErrorMessage("请先输入手机号码或电子邮箱");
      return;
    }
    setErrorMessage(null);
    try {
      const res = await sendVerificationCode(phoneOrEmail.trim());
      setCountdown(60);
      setSuccessInfo(res.message);
      // 自动填充演示验证码方便用户体验
      setVerifyCode("888888");
      setTimeout(() => setSuccessInfo(null), 6000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "验证码发送失败");
    }
  };

  // 密码登录
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account.trim()) {
      setErrorMessage("请输入作者账号、手机号或邮箱");
      return;
    }
    if (!password) {
      setErrorMessage("请输入密码");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await loginWithPassword(account.trim(), password);
      router.push(returnTo);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "登录失败，请重试");
      setIsLoading(false);
    }
  };

  // 验证码登录
  const handleCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneOrEmail.trim()) {
      setErrorMessage("请输入手机号或邮箱");
      return;
    }
    if (!verifyCode.trim()) {
      setErrorMessage("请输入6位验证码");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await loginWithCode(phoneOrEmail.trim(), verifyCode.trim());
      router.push(returnTo);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "验证失败，请重试");
      setIsLoading(false);
    }
  };

  // 注册新作者
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regPenName.trim()) {
      setErrorMessage("请设定您的作者笔名（后续可在设置中修改）");
      return;
    }
    if (!regAccount.trim()) {
      setErrorMessage("请输入手机号或常用邮箱");
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setErrorMessage("密码长度不得少于6位");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMessage("两次输入的密码不一致");
      return;
    }
    if (!regAgreement) {
      setErrorMessage("请阅读并同意创作者服务与数据保密协议");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await register(regPenName.trim(), regAccount.trim(), regPassword);
      router.push(returnTo);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "注册失败，请稍后再试");
      setIsLoading(false);
    }
  };

  // 一键游客体验
  const handleGuestLogin = async () => {
    setErrorMessage(null);
    setGuestLoading(true);
    try {
      await loginAsGuest();
      router.push(returnTo);
    } catch (err) {
      setErrorMessage("进入体验环境失败");
      setGuestLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-[#fffefb] rounded-2xl sm:rounded-3xl border border-[#e5e4de] shadow-[0_12px_40px_rgba(30,40,35,0.06)] flex flex-col justify-between">
      {/* 顶部标题与移动端徽标 */}
      <div>
        <div className="flex lg:hidden items-center justify-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[#176b5b] flex items-center justify-center font-serif text-lg font-bold text-white shadow-sm">
            砚
          </div>
          <span className="font-serif font-bold text-[#1f332d] text-base">
            智能作者创作平台
          </span>
        </div>

        <div className="text-center sm:text-left mb-6">
          <h2 className="text-2xl font-serif font-bold text-[#202923] tracking-tight">
            {mainTab === "login" ? "作者登录" : "加入创作"}
          </h2>
          <p className="text-xs text-[#737b76] mt-1.5">
            {mainTab === "login"
              ? "登入您的专属写作空间，续写未竟篇章"
              : "开启专属个人写作库，让奇思妙想落地生根"}
          </p>
        </div>

        {/* 顶部主选项卡：登录 / 注册 */}
        <div className="flex p-1 bg-[#f0eee9] rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setMainTab("login");
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mainTab === "login"
                ? "bg-white text-[#176b5b] shadow-xs"
                : "text-[#6b7570] hover:text-[#202923]"
            }`}
          >
            作者登录
          </button>
          <button
            type="button"
            onClick={() => {
              setMainTab("register");
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mainTab === "register"
                ? "bg-white text-[#176b5b] shadow-xs"
                : "text-[#6b7570] hover:text-[#202923]"
            }`}
          >
            注册新作者
          </button>
        </div>

        {/* 提示信息 */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-red-50/90 border border-red-200 text-red-700 text-xs flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {successInfo && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{successInfo}</div>
          </div>
        )}

        {/* 主内容：登录模式 */}
        {mainTab === "login" && (
          <div>
            {/* 登录方式小切换：密码登录 vs 验证码快捷登录 */}
            <div className="flex items-center justify-between border-b border-[#ecebe6] pb-2.5 mb-4 text-xs">
              <span className="text-[#88918c] font-medium">请选择登录方式</span>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("password");
                    setErrorMessage(null);
                  }}
                  className={`relative font-medium transition-colors ${
                    loginMethod === "password"
                      ? "text-[#176b5b] font-semibold"
                      : "text-[#7b837e] hover:text-[#202923]"
                  }`}
                >
                  账号密码
                </button>
                <span className="text-[#d8ded9]">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("code");
                    setErrorMessage(null);
                  }}
                  className={`relative font-medium transition-colors ${
                    loginMethod === "code"
                      ? "text-[#176b5b] font-semibold"
                      : "text-[#7b837e] hover:text-[#202923]"
                  }`}
                >
                  验证码快速登录
                </button>
              </div>
            </div>

            {loginMethod === "password" ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#526058] font-medium">账号 / 手机号 / 邮箱</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9aa29e]">
                      <User className="w-4 h-4" />
                    </div>
                    <Input
                      type="text"
                      placeholder="请输入您的作者账号或邮箱"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      className="pl-9 text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-[#526058] font-medium">密码</Label>
                    <button
                      type="button"
                      onClick={() =>
                        alert("演示环境支持任意测试密码或使用一键体验通道")
                      }
                      className="text-[11px] text-[#176b5b] hover:underline"
                    >
                      忘记密码？
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9aa29e]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="请输入您的登录密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-9 text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9aa29e] hover:text-[#526058]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 mt-2 bg-[#176b5b] hover:bg-[#13594b] text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      登入工作台...
                    </>
                  ) : (
                    <>
                      立即登录
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCodeLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#526058] font-medium">手机号码或邮箱</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9aa29e]">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <Input
                      type="text"
                      placeholder="用于接收验证短信或邮件"
                      value={phoneOrEmail}
                      onChange={(e) => setPhoneOrEmail(e.target.value)}
                      className="pl-9 text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-[#526058] font-medium">验证码</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9aa29e]">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <Input
                        type="text"
                        maxLength={6}
                        placeholder="6位数字验证码"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        className="pl-9 text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] tracking-widest focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={countdown > 0}
                      onClick={handleSendCode}
                      className="text-xs h-10 px-3.5 rounded-xl border-[#d8ded9] text-[#24574d] hover:bg-[#eef3f0]"
                    >
                      {countdown > 0 ? `${countdown}s 后重发` : "获取验证码"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-[#939a95]">
                    未注册的手机号验证通过后将自动创建作者档案
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 mt-2 bg-[#176b5b] hover:bg-[#13594b] text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      验证并登入...
                    </>
                  ) : (
                    <>
                      验证登入
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        )}

        {/* 主内容：注册新作者 */}
        {mainTab === "register" && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#526058] font-medium">作家笔名</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9aa29e]">
                  <Feather className="w-4 h-4" />
                </div>
                <Input
                  type="text"
                  placeholder="例如：沈砚 / 沧海客 / 拂晓听风"
                  value={regPenName}
                  onChange={(e) => setRegPenName(e.target.value)}
                  className="pl-9 text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#526058] font-medium">绑定手机或邮箱</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9aa29e]">
                  <Mail className="w-4 h-4" />
                </div>
                <Input
                  type="text"
                  placeholder="用于登录与作品凭证保护"
                  value={regAccount}
                  onChange={(e) => setRegAccount(e.target.value)}
                  className="pl-9 text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">设置密码</Label>
                <Input
                  type="password"
                  placeholder="不少于6位"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">确认密码</Label>
                <Input
                  type="password"
                  placeholder="再次输入"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  className="text-xs h-10 rounded-xl bg-[#fcfcfb] border-[#d8ded9] focus-visible:border-[#176b5b] focus-visible:ring-1 focus-visible:ring-[#176b5b]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="agreement"
                type="checkbox"
                checked={regAgreement}
                onChange={(e) => setRegAgreement(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[#cfd6d1] text-[#176b5b] focus:ring-[#176b5b]"
              />
              <label htmlFor="agreement" className="text-[11px] text-[#717b75] leading-none cursor-pointer">
                我已阅读并同意
                <span className="text-[#176b5b] hover:underline mx-1">《创作者服务协议》</span>
                与
                <span className="text-[#176b5b] hover:underline ml-1">《本地数据保护承诺》</span>
              </label>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 mt-1.5 bg-[#176b5b] hover:bg-[#13594b] text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  创建作者档案...
                </>
              ) : (
                <>
                  完成注册并开启创作
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </>
              )}
            </Button>
          </form>
        )}
      </div>

      {/* 分割线与游客一键体验通道 */}
      <div className="mt-8 pt-5 border-t border-[#eeede8]">
        <div className="relative flex justify-center text-[11px] uppercase mb-4">
          <span className="bg-[#fffefb] px-3 text-[#9aa29d]">或者</span>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={guestLoading || isLoading}
          onClick={handleGuestLogin}
          className="w-full h-10 rounded-xl border-[#d3dbd6] bg-[#f7faf8] hover:bg-[#eef5f1] text-[#176b5b] text-xs font-medium transition-all group"
        >
          {guestLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              正在加载示范作品...
            </>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <UserCheck className="w-4 h-4 text-[#176b5b]" />
              <span>以「示范作者·沈砚」快速体验工作台</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#176b5b]/60 group-hover:translate-x-0.5 transition-transform" />
            </div>
          )}
        </Button>

        <p className="text-[11px] text-center text-[#959d98] mt-3">
          本地优先架构 · 创作草稿将完整保留在当前浏览器中
        </p>
      </div>
    </div>
  );
}
