"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bold,
  BookOpen,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileClock,
  FileDown,
  FilePlus2,
  Globe2,
  Heading2,
  Italic,
  List,
  MoreHorizontal,
  Plus,
  Quote,
  Redo2,
  Search,
  Settings2,
  Sparkles,
  Target,
  Undo2,
  UserRound,
  UsersRound,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserMenu } from "@/components/auth/user-menu";

type Chapter = {
  id: string;
  title: string;
  content: string;
  status: "draft" | "done";
};

type AiSettings = {
  endpoint: string;
  model: string;
  apiKey: string;
};

const STORAGE_KEY = "smart-author-demo-v1";

const initialChapters: Chapter[] = [
  {
    id: "chapter-1",
    title: "第一章 雨夜来客",
    status: "done",
    content: `
      <p>雨下到第三更，青石巷里的灯火已经熄了大半。</p>
      <p>沈砚把最后一册旧书收入木箱，正要合上铺门，门外忽然响起三声叩击。不轻不重，像是来人早已算准他的耐心。</p>
      <p>他隔着门问：“找谁？”</p>
      <p>回答他的只有雨声。片刻后，一封被油纸裹紧的信从门缝下推了进来。信封上没有落款，只用朱砂写着四个字——<strong>故人已归</strong>。</p>
      <p>沈砚盯着那行字，指尖停在半空。十年前埋进北山雪里的秘密，终于还是找上了门。</p>
    `,
  },
  {
    id: "chapter-2",
    title: "第二章 无字旧书",
    status: "draft",
    content: `<p>天亮以前，沈砚在旧书的夹层里找到了一张陌生的舆图。</p><p>墨线所指之处，正是北山禁地。</p>`,
  },
  {
    id: "chapter-3",
    title: "第三章 北山旧事",
    status: "draft",
    content: `<p>关于北山，城里的人总有许多传说，却没有一个人愿意在入夜后提起。</p>`,
  },
  {
    id: "chapter-4",
    title: "第四章 灯下影",
    status: "draft",
    content: `<p>灯焰晃了一下，墙上的影子却没有跟着动。</p>`,
  },
];

const projectNav = [
  { label: "正文", icon: BookOpen, active: true },
  { label: "大纲", icon: Archive },
  { label: "角色", icon: UsersRound },
  { label: "设定", icon: Globe2 },
  { label: "时间线", icon: Clock3 },
];

const aiActions = [
  { id: "continue", label: "续写这一段", icon: Sparkles },
  { id: "polish", label: "润色选中内容", icon: WandSparkles },
  { id: "brainstorm", label: "推演后续情节", icon: BrainCircuit },
];

function plainText(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

export default function Home() {
  const [chapters, setChapters] = useState(initialChapters);
  const [selectedId, setSelectedId] = useState(initialChapters[0].id);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [rightTab, setRightTab] = useState("ai");
  const [aiPrompt, setAiPrompt] = useState("保持克制悬疑的语气，续写来客真正现身前的场景。");
  const [aiResult, setAiResult] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState<AiSettings>({
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "",
  });
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = chapters.find((chapter) => chapter.id === selectedId) ?? chapters[0];
  const chapterWords = plainText(selected.content).length;
  const totalWords = chapters.reduce((sum, chapter) => sum + plainText(chapter.content).length, 0);
  const goal = 3000;
  const progress = Math.min(100, Math.round((chapterWords / goal) * 100));

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const data = JSON.parse(stored) as {
        chapters?: Chapter[];
        selectedId?: string;
        settings?: AiSettings;
      };
      if (data.chapters?.length) setChapters(data.chapters);
      if (data.selectedId) setSelectedId(data.selectedId);
      if (data.settings) setSettings(data.settings);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== selected.content) {
      editorRef.current.innerHTML = selected.content;
    }
  }, [selectedId, selected.content]);

  const groupedChapters = useMemo(
    () => [
      { title: "卷一 · 雨夜故人", items: chapters.slice(0, 3) },
      { title: "卷二 · 山河入梦", items: chapters.slice(3) },
    ],
    [chapters],
  );

  function persist(nextChapters: Chapter[], nextSelected = selectedId, nextSettings = settings) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ chapters: nextChapters, selectedId: nextSelected, settings: nextSettings }),
    );
  }

  function handleEditorInput() {
    const content = editorRef.current?.innerHTML ?? "";
    const next = chapters.map((chapter) =>
      chapter.id === selectedId ? { ...chapter, content } : chapter,
    );
    setChapters(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist(next);
      setSaveState("saved");
    }, 650);
  }

  function selectChapter(id: string) {
    setSelectedId(id);
    persist(chapters, id);
  }

  function addChapter() {
    const id = `chapter-${Date.now()}`;
    const next = [
      ...chapters,
      {
        id,
        title: `第${chapters.length + 1}章 未命名章节`,
        content: "<p>从这里开始新的故事……</p>",
        status: "draft" as const,
      },
    ];
    setChapters(next);
    setSelectedId(id);
    persist(next, id);
  }

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  }

  function runAiPreview(action: string) {
    setIsGenerating(true);
    setAiResult("");
    window.setTimeout(() => {
      const samples: Record<string, string> = {
        continue:
          "门轴发出一声极轻的呻吟。沈砚没有抬头，只将那封信压在掌下。雨幕里，一双沾着泥水的靴子停在门槛之外。",
        polish:
          "雨落三更，青石巷里的灯火已熄去大半。沈砚收好最后一册旧书，正欲闭门，门外忽然传来三声叩响。",
        brainstorm:
          "来客并非故人，而是携带故人记忆的傀儡；无字旧书会在接触旧物时显现线索；北山禁地与沈砚缺失的十年记忆相连。",
      };
      setAiResult(samples[action] ?? samples.continue);
      setIsGenerating(false);
    }, 720);
  }

  function saveSettings() {
    persist(chapters, selectedId, settings);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">墨</div>
          <div>
            <p className="brand-name">智能作者创作平台</p>
            <button className="project-switcher" type="button">
              长夜行 <ChevronDown size={14} />
            </button>
          </div>
        </div>

        <nav className="topnav" aria-label="工作区导航">
          <button className="is-active" type="button">写作</button>
          <button type="button">素材库</button>
          <button type="button">统计</button>
        </nav>

        <div className="top-actions">
          <span className="local-badge"><Check size={13} /> 已保存到本机</span>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="AI 接口设置">
                <Settings2 />
              </Button>
            </DialogTrigger>
            <DialogContent className="ai-settings-dialog">
              <DialogHeader>
                <DialogTitle>AI 接口设置</DialogTitle>
                <DialogDescription>
                  当前为本地演示。配置仅保存在这台设备上，正式接入时将由服务端加密转发，避免密钥暴露在浏览器中。
                </DialogDescription>
              </DialogHeader>
              <label className="field-label">
                API 地址
                <input
                  value={settings.endpoint}
                  onChange={(event) => setSettings({ ...settings, endpoint: event.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="field-label">
                模型名称
                <input
                  value={settings.model}
                  onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                  placeholder="deepseek-chat"
                />
              </label>
              <label className="field-label">
                API Key
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                  placeholder="sk-••••••••"
                />
              </label>
              <DialogFooter>
                <Button onClick={saveSettings}>保存到本机</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <UserMenu />
        </div>
      </header>

      <div className="workspace">
        <aside className="tool-rail" aria-label="作品工具">
          {projectNav.map(({ label, icon: Icon, active }) => (
            <button key={label} className={active ? "rail-item is-active" : "rail-item"} type="button">
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </aside>

        <aside className="chapter-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">作品目录</p>
              <h2>章节</h2>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="搜索章节"><Search /></Button>
          </div>

          <div className="chapter-scroll">
            {groupedChapters.map((group, groupIndex) => (
              <section className="volume" key={group.title}>
                <button className="volume-title" type="button">
                  <ChevronDown size={14} />
                  <span>{group.title}</span>
                  <span className="volume-count">{group.items.length}</span>
                </button>
                <div className="chapter-list">
                  {group.items.map((chapter, chapterIndex) => {
                    const number = groupIndex === 0 ? chapterIndex + 1 : chapterIndex + 4;
                    return (
                      <button
                        key={chapter.id}
                        className={chapter.id === selectedId ? "chapter-item is-active" : "chapter-item"}
                        onClick={() => selectChapter(chapter.id)}
                        type="button"
                      >
                        <span className="chapter-number">{String(number).padStart(2, "0")}</span>
                        <span className="chapter-copy">
                          <strong>{chapter.title.replace(/^第.+章\s*/, "")}</strong>
                          <small>{plainText(chapter.content).length} 字 · {chapter.status === "done" ? "已完成" : "草稿"}</small>
                        </span>
                        {chapter.status === "done" && <Check className="chapter-check" size={14} />}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <button className="add-chapter" type="button" onClick={addChapter}>
            <Plus size={16} /> 新建章节
          </button>
        </aside>

        <section className="editor-stage">
          <div className="editor-toolbar" role="toolbar" aria-label="富文本工具栏">
            <div className="toolbar-group">
              <button type="button" aria-label="撤销" onClick={() => format("undo")}><Undo2 /></button>
              <button type="button" aria-label="重做" onClick={() => format("redo")}><Redo2 /></button>
            </div>
            <span className="toolbar-divider" />
            <div className="toolbar-group">
              <button type="button" aria-label="二级标题" onClick={() => format("formatBlock", "h2")}><Heading2 /></button>
              <button type="button" aria-label="加粗" onClick={() => format("bold")}><Bold /></button>
              <button type="button" aria-label="斜体" onClick={() => format("italic")}><Italic /></button>
              <button type="button" aria-label="引用" onClick={() => format("formatBlock", "blockquote")}><Quote /></button>
              <button type="button" aria-label="列表" onClick={() => format("insertUnorderedList")}><List /></button>
            </div>
            <span className="toolbar-spacer" />
            <Button variant="ghost" size="sm"><FileClock /> 版本</Button>
            <Button variant="ghost" size="sm"><FileDown /> 导出</Button>
            <Button variant="ghost" size="icon-sm" aria-label="更多选项"><MoreHorizontal /></Button>
          </div>

          <div className="paper-scroll">
            <article className="writing-paper">
              <div className="chapter-kicker">长夜行 · 卷一</div>
              <input
                className="chapter-title-input"
                aria-label="章节标题"
                value={selected.title}
                onChange={(event) => {
                  const next = chapters.map((chapter) =>
                    chapter.id === selectedId ? { ...chapter, title: event.target.value } : chapter,
                  );
                  setChapters(next);
                  setSaveState("saving");
                  if (saveTimer.current) clearTimeout(saveTimer.current);
                  saveTimer.current = setTimeout(() => {
                    persist(next);
                    setSaveState("saved");
                  }, 650);
                }}
              />
              <div className="chapter-meta">
                <span>今天 18:42 更新</span>
                <span>·</span>
                <span>{chapterWords} 字</span>
              </div>
              <div
                ref={editorRef}
                className="rich-editor"
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                aria-label="章节正文编辑器"
              />
            </article>
          </div>

          <footer className="editor-statusbar">
            <span className={saveState === "saving" ? "save-status is-saving" : "save-status"}>
              {saveState === "saving" ? "正在保存…" : <><Check size={13} /> 已自动保存</>}
            </span>
            <div className="status-spacer" />
            <span>本章 {chapterWords} 字</span>
            <span>全书 {totalWords.toLocaleString("zh-CN")} 字</span>
          </footer>
        </section>

        <aside className="inspector-panel">
          <Tabs value={rightTab} onValueChange={setRightTab} className="inspector-tabs">
            <TabsList variant="line" className="inspector-tab-list">
              <TabsTrigger value="ai"><Bot /> AI 助手</TabsTrigger>
              <TabsTrigger value="notes"><UserRound /> 本章信息</TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="inspector-content">
              <div className="ai-identity">
                <div className="ai-orb"><Sparkles size={18} /></div>
                <div>
                  <strong>灵感助手</strong>
                  <p>仅使用当前章节与手动输入的要求</p>
                </div>
                <span className="preview-pill">预览</span>
              </div>

              <div className="context-card">
                <div className="context-card-title">
                  <span>本次参考范围</span>
                  <button type="button">调整</button>
                </div>
                <div className="context-token"><BookOpen size={14} /> 当前章节：{selected.title}</div>
                <div className="context-token"><Archive size={14} /> 卷一大纲</div>
              </div>

              <div className="quick-actions">
                {aiActions.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => runAiPreview(id)}>
                    <Icon size={16} />
                    <span>{label}</span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>

              <label className="prompt-box">
                <span>告诉 AI 你想要什么</span>
                <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
                <div>
                  <span>{aiPrompt.length}/300</span>
                  <Button size="sm" onClick={() => runAiPreview("continue")} disabled={isGenerating}>
                    <Sparkles /> {isGenerating ? "构思中…" : "生成建议"}
                  </Button>
                </div>
              </label>

              {aiResult && (
                <div className="ai-result">
                  <div className="ai-result-heading"><Sparkles size={15} /> 建议片段</div>
                  <p>{aiResult}</p>
                  <div className="ai-result-actions">
                    <button type="button" onClick={() => setAiResult("")}>舍弃</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!editorRef.current) return;
                        editorRef.current.innerHTML += `<p>${aiResult}</p>`;
                        handleEditorInput();
                        setAiResult("");
                      }}
                    >
                      插入正文
                    </button>
                  </div>
                </div>
              )}

              <div className="goal-card">
                <div className="goal-heading">
                  <div><Target size={16} /><span>今日目标</span></div>
                  <strong>{chapterWords} / {goal}</strong>
                </div>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                <p>已完成 {progress}% · 保持这个节奏</p>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="inspector-content">
              <section className="note-section">
                <p className="eyebrow">出场角色</p>
                <div className="character-card">
                  <div className="character-avatar">沈</div>
                  <div><strong>沈砚</strong><p>旧书铺掌柜 · 主角</p></div>
                </div>
              </section>
              <section className="note-section">
                <p className="eyebrow">关键线索</p>
                <ul className="clue-list">
                  <li>朱砂所写“故人已归”</li>
                  <li>北山雪中的十年秘密</li>
                  <li>尚未露面的雨夜来客</li>
                </ul>
              </section>
              <section className="note-section">
                <p className="eyebrow">时间与地点</p>
                <div className="info-row"><Clock3 size={15} /><span>霜降后第三日 · 三更</span></div>
                <div className="info-row"><Globe2 size={15} /><span>临川城 · 青石巷</span></div>
              </section>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <div className="desktop-notice">
        <BookOpen />
        <strong>请使用桌面浏览器打开</strong>
        <span>第一版专为桌面写作场景设计。</span>
      </div>
    </main>
  );
}
