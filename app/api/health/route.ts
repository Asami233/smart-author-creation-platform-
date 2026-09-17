import { api } from "@/server/http";

export async function GET() {
  return api(async () => ({
    status: "ok",
    service: "smart-author-backend",
    time: new Date().toISOString(),
  }));
}
