"use client";

import { useEffect, useState } from "react";
import {
  Award,
  Check,
  Cpu,
  Download,
  Feather,
  FileText,
  HardDrive,
  KeyRound,
  Lock,
  Mail,
  Medal,
  Phone,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/client/auth";

type ProfileTab = "profile" | "editor" | "ai" | "storage";

export function ProfileView() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [isSaved, setIsSaved] = useState(false);

  // 1. 作者档案状态
  const [penName, setPenName] = useState(user?.penName || "沈砚");
  const [titleTag, setTitleTag] = useState("签约作家 · 仙侠品类");
  const [bio, setBio] = useState(user?.bio || "十年笔耕，唯愿写尽人间清欢与刀光剑影。");
  const [phone, setPhone] = useState("138****8888");
  const [email, setEmail] = useState(user?.account?.includes("@") ? user.account : "shenyan@author.studio");

  // 2. 写作习惯与编辑器偏好状态
  const [fontFamily, setFontFamily] = useState<"serif" | "sans">("serif");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [lineHeight, setLineHeight] = useState<"compact" | "normal" | "loose">("normal");
  const [autoSaveInterval, setAutoSaveInterval] = useState("650");
  const [paragraphIndent, setParagraphIndent] = useState(true);

  // 3. AI 模型推演偏好状态
  const [aiProvider, setAiProvider] = useState("deepseek");
  const [aiTemperature, setAiTemperature] = useState(0.7);
  const [aiMaxTokens, setAiMaxTokens] = useState("1500");
  const [aiPromptStyle, setAiPromptStyle] = useState("克制留白，注重环境烘托与人物微动作");

  // 4. 数据与缓存
  const [storageUsage, setStorageUsage] = useState("1.85 MB");

  useEffect(() => {
    if (user?.penName) setPenName(user.penName);
    if (user?.bio) setBio(user.bio);
  }, [user]);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleExportFullBackup = () => {
    const backupData = {
      version: "1.0",
      exportTime: new Date().toISOString(),
      author: { penName, bio, email },
      settings: { fontFamily, fontSize, lineHeight, autoSaveInterval },
      scope: "all-works",
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${penName}_全书创作备份_${new Date().toLocaleDateString("zh-CN")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-5xl mx-auto bg-[#fffefb] rounded-3xl border border-[#e5e4de] shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[640px]">
      {/* 左侧垂直选项卡导览 */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#ecebe6] bg-[#fafaf7] p-5 flex flex-col justify-between shrink-0">
        <div>
          {/* 头像与简明作者徽章 */}
          <div className="flex items-center gap-3.5 pb-6 border-b border-[#ecebe6] mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#176b5b] text-white font-serif font-bold text-xl flex items-center justify-center shadow-md">
              {penName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif font-bold text-base text-[#202923] truncate">
                {penName}
              </h3>
              <span className="text-[11px] text-[#717b75] font-mono block truncate">
                {email}
              </span>
            </div>
          </div>

          {/* 导航按钮组 */}
          <nav className="space-y-1.5" aria-label="设置类别">
            <button
              onClick={() => setActiveTab("profile")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === "profile"
                  ? "bg-[#eef3f0] text-[#176b5b] font-bold shadow-2xs"
                  : "text-[#65716b] hover:bg-[#f1f0ec] hover:text-[#202923]"
              }`}
            >
              <User className="w-4 h-4" />
              <span>作者档案与成就</span>
            </button>

            <button
              onClick={() => setActiveTab("editor")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === "editor"
                  ? "bg-[#eef3f0] text-[#176b5b] font-bold shadow-2xs"
                  : "text-[#65716b] hover:bg-[#f1f0ec] hover:text-[#202923]"
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>写作与编辑器偏好</span>
            </button>

            <button
              onClick={() => setActiveTab("ai")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === "ai"
                  ? "bg-[#eef3f0] text-[#176b5b] font-bold shadow-2xs"
                  : "text-[#65716b] hover:bg-[#f1f0ec] hover:text-[#202923]"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>AI 辅助与灵感推演</span>
            </button>

            <button
              onClick={() => setActiveTab("storage")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === "storage"
                  ? "bg-[#eef3f0] text-[#176b5b] font-bold shadow-2xs"
                  : "text-[#65716b] hover:bg-[#f1f0ec] hover:text-[#202923]"
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>数据保全与存储</span>
            </button>
          </nav>
        </div>

        {/* 底部保存状态 */}
        <div className="pt-6 border-t border-[#ecebe6]">
          <Button
            onClick={handleSave}
            className="w-full bg-[#176b5b] hover:bg-[#13594b] text-white text-xs h-9 rounded-xl shadow-xs gap-1.5"
          >
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>已保存到本机</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>保存全部修改</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* 右侧设置主内容面板 */}
      <main className="flex-1 p-6 sm:p-8 md:p-10 overflow-y-auto max-h-[calc(100vh-140px)]">
        {/* 1. 作者档案与成就 */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#202923]">作者档案与创作成就</h2>
              <p className="text-xs text-[#7d8782] mt-1">
                管理您的作家专属笔名、个人简介与在平台获得的历史创作勋章。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">作家笔名</Label>
                <Input
                  value={penName}
                  onChange={(e) => setPenName(e.target.value)}
                  className="h-10 text-xs rounded-xl bg-[#fcfcfb] border-[#d8ded9]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">头衔称号</Label>
                <Input
                  value={titleTag}
                  onChange={(e) => setTitleTag(e.target.value)}
                  className="h-10 text-xs rounded-xl bg-[#fcfcfb] border-[#d8ded9]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#526058] font-medium">创作心境 / 签名</Label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-[#d8ded9] bg-[#fcfcfb] leading-relaxed resize-none outline-none focus:border-[#176b5b]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">联系电话 (保密)</Label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#9aa29e] absolute left-3 top-3" />
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-10 pl-9 text-xs rounded-xl bg-[#fcfcfb] border-[#d8ded9]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">作者安全邮箱</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#9aa29e] absolute left-3 top-3" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 pl-9 text-xs rounded-xl bg-[#fcfcfb] border-[#d8ded9]"
                  />
                </div>
              </div>
            </div>

            {/* 成就勋章展示 */}
            <div className="pt-6 border-t border-[#f0eee8]">
              <h3 className="text-xs font-serif font-bold text-[#202923] mb-3 flex items-center gap-1.5">
                <TrophyIcon className="w-4 h-4 text-[#176b5b]" />
                <span>创作成就殿堂</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[#f6f8f7] border border-[#e0ebe5] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#176b5b]/15 text-[#176b5b] flex items-center justify-center">
                    <Feather className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-xs text-[#202923] block">下笔有神</strong>
                    <span className="text-[10px] text-[#717b75]">累计创作超 3 万字</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#fbf8f2] border border-[#eee4d0] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-600/15 text-amber-700 flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-xs text-[#202923] block">持之以恒</strong>
                    <span className="text-[10px] text-[#717b75]">连续创作打卡 12 天</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#f7f4fa] border border-[#e8ddf2] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-600/15 text-purple-700 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <strong className="text-xs text-[#202923] block">伏线千里</strong>
                    <span className="text-[10px] text-[#717b75]">已收录 4 项世界观设定</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. 写作与编辑器偏好 */}
        {activeTab === "editor" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#202923]">写作与编辑器偏好</h2>
              <p className="text-xs text-[#7d8782] mt-1">
                打造最契合您创作心流的排版比例与视觉舒适度。
              </p>
            </div>

            {/* 字体选择 */}
            <div className="space-y-2">
              <Label className="text-xs text-[#526058] font-medium">默认排版字体</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFontFamily("serif")}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    fontFamily === "serif"
                      ? "bg-[#eef3f0] border-[#176b5b] text-[#176b5b]"
                      : "bg-white border-[#d8ded9] text-[#4a5550]"
                  }`}
                >
                  <div className="font-serif font-bold text-sm mb-1">典雅宋体 · 纸墨文风</div>
                  <p className="text-[11px] text-[#78827d]">
                    适合长篇玄幻、仙侠、古言网文，沉浸温润
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFontFamily("sans")}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    fontFamily === "sans"
                      ? "bg-[#eef3f0] border-[#176b5b] text-[#176b5b]"
                      : "bg-white border-[#d8ded9] text-[#4a5550]"
                  }`}
                >
                  <div className="font-sans font-bold text-sm mb-1">现代黑体 · 清晰利落</div>
                  <p className="text-[11px] text-[#78827d]">
                    适合科幻、悬疑与都市快节奏创作，字形硬朗
                  </p>
                </button>
              </div>
            </div>

            {/* 自动保存频率与段首缩进 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">自动保存防抖延迟</Label>
                <select
                  value={autoSaveInterval}
                  onChange={(e) => setAutoSaveInterval(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#d8ded9] bg-white text-xs outline-none focus:border-[#176b5b]"
                >
                  <option value="300">300ms (极速存盘，适合手速爆发)</option>
                  <option value="650">650ms (平衡推荐，兼顾性能与安全)</option>
                  <option value="1200">1200ms (适度宽松)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-[#526058] font-medium">段首两字符缩进</Label>
                <div className="h-10 flex items-center justify-between px-3.5 rounded-xl border border-[#d8ded9] bg-white">
                  <span className="text-xs text-[#202923]">正文自然段自动缩进 2 格</span>
                  <input
                    type="checkbox"
                    checked={paragraphIndent}
                    onChange={(e) => setParagraphIndent(e.target.checked)}
                    className="w-4 h-4 rounded text-[#176b5b] focus:ring-[#176b5b]"
                  />
                </div>
              </div>
            </div>

            {/* 即时排版效果预览 */}
            <div className="pt-4 border-t border-[#f0eee8]">
              <Label className="text-xs text-[#526058] font-medium block mb-2">
                即时排版效果预览
              </Label>
              <div
                className={`p-5 rounded-2xl bg-[#fffefb] border border-[#e1e0da] shadow-xs text-sm leading-relaxed text-[#2c3732] ${
                  fontFamily === "serif" ? "font-serif" : "font-sans"
                }`}
              >
                <p className={paragraphIndent ? "indent-8" : ""}>
                  雨下到第三更，青石巷里的灯火已经熄了大半。沈砚把最后一册旧书收入木箱，门外忽然响起三声叩击。十年前埋进北山雪里的秘密，终于还是找上了门。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 3. AI 辅助与灵感推演偏好 */}
        {activeTab === "ai" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#202923]">AI 辅助与推演偏好</h2>
              <p className="text-xs text-[#7d8782] mt-1">
                配置模型接口与创作发散度，严格遵循“隐私优先、不默认全篇上传”原则。
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#526058] font-medium">默认模型供应商预设</Label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#d8ded9] bg-white text-xs outline-none focus:border-[#176b5b]"
              >
                <option value="deepseek">DeepSeek (深度求索 - 推荐中文网文逻辑与长文)</option>
                <option value="openai">OpenAI (GPT-4o / GPT-4.1-mini)</option>
                <option value="moonshot">Moonshot (Kimi - 超长上下文推演)</option>
                <option value="custom">自建兼容 OpenAI API 服务</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[#526058] font-medium">
                  模型发散度 / 创造力 (Temperature)
                </Label>
                <span className="text-xs font-mono font-bold text-[#176b5b]">
                  {aiTemperature}
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={aiTemperature}
                onChange={(e) => setAiTemperature(parseFloat(e.target.value))}
                className="w-full accent-[#176b5b] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8e9691]">
                <span>0.2 严格严谨（严遵设定大纲）</span>
                <span>0.7 平衡创作（推荐）</span>
                <span>1.0 奇思妙想（脑洞大开）</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-[#526058] font-medium">默认续写文风指示词</Label>
              <Input
                value={aiPromptStyle}
                onChange={(e) => setAiPromptStyle(e.target.value)}
                className="h-10 text-xs rounded-xl bg-[#fcfcfb] border-[#d8ded9]"
              />
            </div>

            <div className="p-4 rounded-xl bg-[#f4f7f6] border border-[#d4e4de] flex items-start gap-3 text-xs text-[#24574d]">
              <ShieldCheck className="w-5 h-5 shrink-0 text-[#176b5b] mt-0.5" />
              <div>
                <strong className="block mb-0.5">隐私与数据隔离准则</strong>
                <span>
                  本平台默认仅发送您在工作台明确勾选的章节片段与大纲条目，绝不私自上传整书稿件。AI生成的建议必须由您主动采纳才会写入正文。
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 4. 数据保全与存储 */}
        {activeTab === "storage" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#202923]">本地数据保全与备份</h2>
              <p className="text-xs text-[#7d8782] mt-1">
                作品数据以本地优先理念存放在当前设备中，建议定期导出存档以防数据遗失。
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#fafaf7] border border-[#e4e4df] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e4eeea] text-[#176b5b] flex items-center justify-center">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#202923]">本地缓存容量</h4>
                  <p className="text-[11px] text-[#717b75]">
                    包含章节草稿、大纲、人物谱与历史快照
                  </p>
                </div>
              </div>
              <span className="text-sm font-serif font-bold text-[#176b5b] font-mono">
                {storageUsage}
              </span>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleExportFullBackup}
                variant="outline"
                className="w-full h-11 rounded-xl border-[#cfd9d4] bg-[#f7faf8] hover:bg-[#eef5f1] text-[#176b5b] text-xs font-medium justify-between px-4"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  <span>导出全库完整档案备份 (.json)</span>
                </div>
                <span className="text-[11px] text-[#7f8883]">含所有大纲与设定</span>
              </Button>
            </div>

            <div className="pt-4 border-t border-[#f0eee8] flex items-center justify-between">
              <div>
                <h5 className="text-xs font-bold text-red-700">危险区域</h5>
                <p className="text-[11px] text-[#9aa29e]">重置或清除当前浏览器本地演示草稿</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("确定要清空本地演示数据吗？清空后将无法找回。")) {
                    localStorage.clear();
                    window.location.href = "/";
                  }
                }}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                重置演示数据
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TrophyIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
