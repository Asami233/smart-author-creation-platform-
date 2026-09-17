import { idSchema } from "@/contracts";
import { AppError, toErrorResponse } from "@/server/errors";
import { ownerIdForRequest } from "@/server/identity";
import { contentDisposition, exportWork } from "@/server/services/export";

type Context = { params: Promise<{ workId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { workId } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "txt";
    if (format !== "txt" && format !== "docx" && format !== "pdf") {
      throw new AppError(400, "UNSUPPORTED_EXPORT_FORMAT", "仅支持 txt、docx 和 pdf 导出");
    }
    const chapterIds = url.searchParams.getAll("chapterId").map((id) => idSchema.parse(id));
    const file = await exportWork(
      idSchema.parse(workId),
      ownerIdForRequest(request),
      format,
      chapterIds.length ? chapterIds : undefined,
    );
    const body = file.bytes.buffer.slice(
      file.bytes.byteOffset,
      file.bytes.byteOffset + file.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-disposition": contentDisposition(file.fileName),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
