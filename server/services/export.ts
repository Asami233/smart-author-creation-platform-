import { all } from "@/server/db";
import { AppError } from "@/server/errors";
import { buildDocx, type ExportVolume } from "@/server/exports/docx";
import { buildPdf } from "@/server/exports/pdf";
import { assertWorkOwned } from "./works";

type ExportChapterRow = {
  id: string;
  volume_id: string | null;
  title: string;
  plain_text: string;
  sort_order: number;
};

type ExportVolumeRow = {
  id: string;
  title: string;
  sort_order: number;
};

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80) || "作品";
}

async function loadExportData(workId: string, ownerId: string, chapterIds?: string[]) {
  const work = await assertWorkOwned(workId, ownerId);
  const [volumeRows, allChapters] = await Promise.all([
    all<ExportVolumeRow>(
      "SELECT id, title, sort_order FROM volumes WHERE work_id = ? ORDER BY sort_order, created_at",
      workId,
    ),
    all<ExportChapterRow>(
      `SELECT id, volume_id, title, plain_text, sort_order
       FROM chapters WHERE work_id = ? AND deleted_at IS NULL
       ORDER BY sort_order, created_at`,
      workId,
    ),
  ]);
  const selected = chapterIds?.length
    ? allChapters.filter((chapter) => chapterIds.includes(chapter.id))
    : allChapters;
  if (chapterIds?.length && selected.length !== new Set(chapterIds).size) {
    throw new AppError(400, "INVALID_CHAPTER_SELECTION", "导出范围包含无效章节");
  }

  const volumes: ExportVolume[] = volumeRows.map((volume) => ({
    title: volume.title,
    chapters: selected
      .filter((chapter) => chapter.volume_id === volume.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((chapter) => ({ title: chapter.title, text: chapter.plain_text })),
  }));
  const loose = selected.filter((chapter) => chapter.volume_id === null);
  if (loose.length) {
    volumes.push({
      title: "未分卷",
      chapters: loose
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((chapter) => ({ title: chapter.title, text: chapter.plain_text })),
    });
  }
  return { title: work.title, volumes: volumes.filter((volume) => volume.chapters.length > 0) };
}

export async function exportWork(
  workId: string,
  ownerId: string,
  format: "txt" | "docx" | "pdf",
  chapterIds?: string[],
) {
  const data = await loadExportData(workId, ownerId, chapterIds);
  const baseName = safeFileName(data.title);
  if (format === "txt") {
    const sections = [data.title, ""];
    for (const volume of data.volumes) {
      sections.push(volume.title, "");
      for (const chapter of volume.chapters) {
        sections.push(chapter.title, "", chapter.text, "");
      }
    }
    return {
      bytes: new TextEncoder().encode(`\uFEFF${sections.join("\r\n")}`),
      contentType: "text/plain; charset=utf-8",
      fileName: `${baseName}.txt`,
    };
  }
  if (format === "docx") {
    return {
      bytes: buildDocx(data.title, data.volumes),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: `${baseName}.docx`,
    };
  }
  return {
    bytes: buildPdf(data.title, data.volumes),
    contentType: "application/pdf",
    fileName: `${baseName}.pdf`,
  };
}

export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
