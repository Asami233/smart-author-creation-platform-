import { getEmailDeliveryReadiness } from "@/server/auth/mail";

export async function GET(request: Request) {
  const readiness = getEmailDeliveryReadiness(request);
  return Response.json(
    { data: readiness },
    {
      status: readiness.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
