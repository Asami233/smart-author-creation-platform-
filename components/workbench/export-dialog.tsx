"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookDown,
  Download,
  FileText,
  FileType,
  Loader2,
  Printer,
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
import { downloadWorkExport } from "@/lib/client/api";

type ExportFormat = "txt" | "docx" | "pdf";

interface ExportDialogProps {
  workId?: string;
  workTitle?: string;
  chaptersCount?: number;
  totalWords?: number;
  trigger?: React.ReactNode;
}

export function ExportDialog({
  workId,
  workTitle = "我的作品",
  chaptersCount = 0,
  totalWords = 0,
  trigger,
}: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = async () => {
    if (!workId) {
      setErrorMessage("请先选择或创建一部作品后再导出");
      return;
    }
    setIsExporting(true);
    setErrorMessage(null);
    try {
      await downloadWorkExport(workId, format, `${workTitle}.${format}`);
      setOpen(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "导出作品失败，请检查网络或后端服务");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 rounded-lg border-[#d8ded9] text-[#24574d] hover:bg-[#eef3f0] text-xs gap-1.5 cursor-pointer"
          >
            <BookDown className="w-3.5 h-3.5" />
            <span>导出作品</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-[#fffefb] border-[#e2e1dc] sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-[#e4eeea] text-[#176b5b] flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <DialogTitle className="font-serif font-bold text-lg text-[#202923]">
              作品交付与格式导出
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[#7d8782]">
            《{workTitle}》· 现收录 {chaptersCount} 章 · 约 {totalWords.toLocaleString()} 字
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 my-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* 格式选择 */}
          <div>
            <label className="text-xs font-semibold text-[#526058] block mb-2">
              导出文件格式
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setFormat("txt")}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  format === "txt"
                    ? "bg-[#eef3f0] border-[#176b5b] text-[#176b5b] shadow-2xs"
                    : "bg-white border-[#d8ded9] text-[#48534e] hover:bg-[#fafaf8]"
                }`}
              >
                <FileText className="w-5 h-5 mb-1.5" />
                <div className="text-xs font-bold font-mono">TXT 纯文本</div>
                <p className="text-[10px] text-[#858f8a] mt-0.5 leading-tight">
                  标准网文排版·段首双空格换行
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormat("docx")}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  format === "docx"
                    ? "bg-[#eef3f0] border-[#176b5b] text-[#176b5b] shadow-2xs"
                    : "bg-white border-[#d8ded9] text-[#48534e] hover:bg-[#fafaf8]"
                }`}
              >
                <FileType className="w-5 h-5 mb-1.5" />
                <div className="text-xs font-bold font-mono">Word (DOCX)</div>
                <p className="text-[10px] text-[#858f8a] mt-0.5 leading-tight">
                  出版书稿格式·含卷章大纲标题
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormat("pdf")}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  format === "pdf"
                    ? "bg-[#eef3f0] border-[#176b5b] text-[#176b5b] shadow-2xs"
                    : "bg-white border-[#d8ded9] text-[#48534e] hover:bg-[#fafaf8]"
                }`}
              >
                <Printer className="w-5 h-5 mb-1.5" />
                <div className="text-xs font-bold font-mono">PDF 打印档</div>
                <p className="text-[10px] text-[#858f8a] mt-0.5 leading-tight">
                  雅致宋体版心·适合校对封存
                </p>
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isExporting || !workId}
            onClick={handleExport}
            className="w-full bg-[#176b5b] hover:bg-[#13594b] text-white text-sm font-medium h-10 rounded-xl shadow-xs cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                正在生成交付文件...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-1.5" />
                确认并立即下载（真实服务生成）
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
