"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle,
  Clock,
  Edit2,
  Feather,
  Flame,
  LineChart as ChartIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateWorkStats, type WorkStats } from "@/lib/client/api";

interface StatsViewProps {
  workId?: string | null;
  workTitle?: string;
  stats?: WorkStats | null;
  isLoading?: boolean;
  onGoalUpdated?: (updatedStats: WorkStats) => void;
  onRefresh?: () => void;
}

export function StatsView({
  workId,
  workTitle,
  stats,
  isLoading = false,
  onGoalUpdated,
  onRefresh,
}: StatsViewProps) {
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  // 当外部 stats 更新或打开编辑态时，同步目标输入框初始值
  useEffect(() => {
    if (stats) {
      if (stats.todayTargetWords === null) {
        setGoalInput("3000");
      } else {
        setGoalInput(stats.todayTargetWords.toString());
      }
    }
  }, [stats]);

  if (!workId || !stats) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full min-w-0 bg-[#f4f2ed] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#edf5f2] border border-[#bad4cb] flex items-center justify-center text-[#176b5b] mb-4 shadow-sm">
          <ChartIcon size={28} />
        </div>
        <h2 className="text-xl font-serif font-bold text-[#202923] mb-2">
          {isLoading ? "正在加载写作数据统计..." : "暂无作品写作统计"}
        </h2>
        <p className="text-sm text-[#68716c] max-w-sm mb-4">
          {isLoading
            ? "正在拉取当前作品的服务端已保存字数与历史写作记录"
            : "请先在左侧选择或创建一个作品，即可查看服务端已保存的写作看板与连续天数。"}
        </p>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="rounded-xl border-[#cfd6d1] text-[#176b5b] hover:bg-[#edf5f2]"
          >
            <RefreshCw size={14} className={`mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            刷新看板
          </Button>
        )}
      </div>
    );
  }

  // 目标字数逻辑：严格遵循契约区分 null、0 与正整数
  const hasTargetRecord = stats.todayTargetWords !== null;
  const isUnlimitedGoal = stats.todayTargetWords === 0;
  const targetWords = stats.todayTargetWords ?? 0;

  // 进度计算：不设限或无目标时避免除以零
  const progressPercent = isUnlimitedGoal
    ? 100
    : hasTargetRecord && targetWords > 0
    ? Math.min(100, Math.round((stats.todayWordsWritten / targetWords) * 100))
    : 0;

  const isGoalReached = hasTargetRecord && !isUnlimitedGoal && targetWords > 0 && stats.todayWordsWritten >= targetWords;

  // 保存今日写作目标
  const handleSaveGoal = async () => {
    if (!workId) return;
    const trimmed = goalInput.trim();
    if (!/^\d+$/.test(trimmed)) {
      setGoalError("目标字数必须为非负整数");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100000) {
      setGoalError("目标字数范围为 0 ～ 100,000 字（0 表示自由创作不设限）");
      return;
    }

    setIsSavingGoal(true);
    setGoalError(null);
    try {
      const updated = await updateWorkStats(workId, {
        date: stats.today,
        targetWords: parsed,
      });
      onGoalUpdated?.(updated);
      setIsEditingGoal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "更新写作目标失败";
      setGoalError(msg);
    } finally {
      setIsSavingGoal(false);
    }
  };

  // 构造历史趋势图表数据（服务端 daily 数组为唯一事实）
  const chartData = (stats.daily && stats.daily.length > 0)
    ? [...stats.daily]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: d.date.slice(5),
          fullDate: d.date,
          words: d.wordsWritten,
          target: d.targetWords,
        }))
    : [
        {
          date: stats.today.slice(5),
          fullDate: stats.today,
          words: stats.todayWordsWritten,
          target: stats.todayTargetWords || 0,
        },
      ];

  const totalHistoricalWords = stats.daily.reduce((sum, d) => sum + d.wordsWritten, 0);
  const avgDailyWords = stats.daily.length > 0
    ? Math.round(totalHistoricalWords / stats.daily.length)
    : stats.todayWordsWritten;

  const workTargetPercent = stats.targetWords > 0
    ? Math.min(100, Number(((stats.totalWords / stats.targetWords) * 100).toFixed(2)))
    : 100;
  const remainingWorkWords = Math.max(0, stats.targetWords - stats.totalWords);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-[#f4f2ed] overflow-y-auto p-6 md:p-10">
      <div className="max-w-5xl w-full mx-auto space-y-6">
        {/* 顶部标题区 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#dedfd9]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-caption text-[#68716c] font-mono tracking-wider">
                PRODUCTIVITY & ANALYTICS
              </span>
              <span className="text-caption px-2.5 py-0.5 rounded-full bg-[#eef3f0] text-[#176b5b] font-medium">
                🔥 连续创作 {stats.streakDays} 天
              </span>
              <span className="text-caption text-[#8a948e] font-mono">
                上海时间 {stats.today}
              </span>
            </div>
            <h2 className="text-dialog-title font-serif font-bold text-[#202923] mt-1">
              《{workTitle || "当前作品"}》创作看板与服务端统计
            </h2>
            <p className="text-secondary text-[#56615b] mt-1">
              以服务端已保存正向字数为单一事实来源，精确追踪连载节奏与全书完稿进度。
            </p>
          </div>

          {/* 每日目标配置卡片 */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 bg-[#fffefb] p-2.5 rounded-xl border border-[#dedfd9] shadow-2xs">
              <Target className="w-4 h-4 text-[#176b5b] shrink-0" />
              <span className="text-ui text-[#56615b] font-medium">今日目标：</span>
              {isEditingGoal ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="100000"
                    value={goalInput}
                    disabled={isSavingGoal}
                    onChange={(e) => setGoalInput(e.target.value)}
                    placeholder="0 为不设限"
                    className="w-28 h-8 text-ui px-2 py-0 rounded-lg"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveGoal}
                    disabled={isSavingGoal}
                    className="h-8 px-3 text-ui rounded-lg bg-[#176b5b] text-white"
                  >
                    {isSavingGoal ? <Loader2 size={12} className="animate-spin" /> : "保存"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingGoal(false);
                      setGoalError(null);
                    }}
                    disabled={isSavingGoal}
                    className="h-8 px-2 text-ui rounded-lg text-[#68716c]"
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <strong className="text-ui text-[#202923] font-mono font-bold">
                    {stats.todayTargetWords === null
                      ? "未设置"
                      : stats.todayTargetWords === 0
                      ? "自由创作 (不设限)"
                      : `${stats.todayTargetWords.toLocaleString()} 字`}
                  </strong>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingGoal(true);
                      setGoalError(null);
                    }}
                    className="p-1 text-[#68716c] hover:text-[#176b5b] cursor-pointer"
                    title="修改今日目标"
                    aria-label="修改今日目标"
                  >
                    <Edit2 size={13} />
                  </button>
                  {onRefresh && (
                    <button
                      type="button"
                      onClick={onRefresh}
                      className="p-1 text-[#68716c] hover:text-[#176b5b] cursor-pointer ml-1"
                      title="刷新统计数据"
                      aria-label="刷新统计数据"
                    >
                      <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {goalError && (
              <span className="text-caption text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                {goalError}
              </span>
            )}
          </div>
        </div>

        {/* 四大核心指标卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 全书已保存累计字数 */}
          <div className="p-5 bg-[#fffefb] rounded-2xl border border-[#e2e1db] shadow-2xs">
            <div className="flex items-center justify-between text-[#8c9490] text-caption mb-2">
              <span>全书已保存累计字数</span>
              <Feather className="w-4 h-4 text-[#176b5b]" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#202923]">
              {stats.totalWords.toLocaleString()} <span className="text-caption font-normal text-[#8c9490]">字</span>
            </div>
            <p className="text-caption text-[#8c9490] mt-1.5">
              已完成 {stats.completedChapterCount} / {stats.chapterCount} 章节
            </p>
          </div>

          {/* 今日已保存正向字数 */}
          <div className="p-5 bg-[#fffefb] rounded-2xl border border-[#e2e1db] shadow-2xs">
            <div className="flex items-center justify-between text-[#8c9490] text-caption mb-2">
              <span>今日已保存正向字数</span>
              <Flame className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#202923]">
              {stats.todayWordsWritten.toLocaleString()} <span className="text-caption font-normal text-[#8c9490]">字</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 bg-[#eee] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#176b5b] rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-caption font-mono text-[#176b5b] font-medium">
                {isUnlimitedGoal ? "自由创作" : hasTargetRecord ? `${progressPercent}%` : "未设目标"}
              </span>
            </div>
          </div>

          {/* 连续连载天数 */}
          <div className="p-5 bg-[#fffefb] rounded-2xl border border-[#e2e1db] shadow-2xs">
            <div className="flex items-center justify-between text-[#8c9490] text-caption mb-2">
              <span>连续连载打卡</span>
              <CalendarDays className="w-4 h-4 text-[#176b5b]" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#202923]">
              {stats.streakDays} <span className="text-caption font-normal text-[#8c9490]">天不间断</span>
            </div>
            <p className="text-caption text-emerald-700 mt-1.5 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              {stats.streakDays > 0 ? "保持连更，状态极佳" : "今日暂未产出正文"}
            </p>
          </div>

          {/* 全书总目标与完成率 */}
          <div className="p-5 bg-[#fffefb] rounded-2xl border border-[#e2e1db] shadow-2xs">
            <div className="flex items-center justify-between text-[#8c9490] text-caption mb-2">
              <span>全书总目标进度</span>
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-serif text-[#202923]">
              {workTargetPercent}%{" "}
              <span className="text-caption font-normal text-[#8c9490]">
                / {stats.targetWords > 0 ? `${(stats.targetWords / 10000).toFixed(0)}万字` : "未设限"}
              </span>
            </div>
            <p className="text-caption text-[#8c9490] mt-1.5">
              {stats.targetWords > 0
                ? remainingWorkWords > 0
                  ? `还需约 ${(remainingWorkWords / 10000).toFixed(1)} 万字完结`
                  : "全书总字数目标已圆满达成！"
                : "当前作品未设置完稿总目标"}
            </p>
          </div>
        </div>

        {/* 趋势图表区 */}
        <div className="p-6 bg-[#fffefb] rounded-2xl border border-[#e1e0da] shadow-2xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-serif font-bold text-section text-[#202923] flex items-center gap-2">
                <ChartIcon className="w-4 h-4 text-[#176b5b]" />
                <span>连载写作字数趋势</span>
              </h3>
              <p className="text-caption text-[#8c9490] mt-0.5">
                基于服务端保存事实的历史记录（最多展示 90 条连载历史）
              </p>
            </div>
            <span className="text-caption text-[#176b5b] font-medium bg-[#eef5f2] px-2.5 py-1 rounded-lg">
              连载记录日均已保存约 {avgDailyWords.toLocaleString()} 字
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="wordGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#176b5b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#176b5b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eaeaea" />
                <XAxis dataKey="date" stroke="#999" fontSize={11} tickLine={false} />
                <YAxis stroke="#999" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    borderRadius: "10px",
                    border: "1px solid #d8ded9",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [`${value} 字`, "已保存字数"]}
                  labelFormatter={(label, items) => {
                    const item = items?.[0]?.payload;
                    return item?.fullDate || label;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="words"
                  stroke="#176b5b"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#wordGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 创作鼓励语录 */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-[#176b5b]/10 via-[#24806d]/10 to-transparent border border-[#cfded8] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#176b5b] text-white flex items-center justify-center font-serif text-lg font-bold shrink-0">
              恒
            </div>
            <div>
              <h4 className="text-ui font-serif font-bold text-[#1a3830]">
                滴水穿石，九层之台起于累土
              </h4>
              <p className="text-caption text-[#526a61] mt-0.5">
                长篇网文重在稳定节奏。保持当前日更势头，神作指日可待。
              </p>
            </div>
          </div>
          <span className="text-caption text-[#176b5b] font-serif italic hidden md:inline">
            「 字字写来皆是血，十年辛苦不寻常 」
          </span>
        </div>
      </div>
    </div>
  );
}
