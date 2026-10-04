import { getServerSecret } from "@/db";
import type { EmailDeliveryReadiness } from "@/contracts/auth";
import { AppError } from "@/server/errors";
import { evaluateEmailDeliveryReadiness } from "./mail-config";
import { isLocalRequest } from "./runtime";

type MailPurpose = "register" | "login" | "reset";

const subjects: Record<MailPurpose, string> = {
  register: "智能作者创作平台：注册验证码",
  login: "智能作者创作平台：登录验证码",
  reset: "智能作者创作平台：重置密码验证码",
};

export function getEmailDeliveryReadiness(request: Request): EmailDeliveryReadiness {
  return evaluateEmailDeliveryReadiness({
    apiKey: getServerSecret("RESEND_API_KEY"),
    from: getServerSecret("AUTH_EMAIL_FROM"),
    localRequest: isLocalRequest(request),
  });
}

export async function sendVerificationEmail(input: {
  request: Request;
  email: string;
  code: string;
  purpose: MailPurpose;
}): Promise<{ delivery: "email" | "development"; devCode?: string }> {
  const apiKey = getServerSecret("RESEND_API_KEY");
  const from = getServerSecret("AUTH_EMAIL_FROM");
  const readiness = evaluateEmailDeliveryReadiness({
    apiKey,
    from,
    localRequest: isLocalRequest(input.request),
  });
  if (readiness.mode === "development") {
    return { delivery: "development", devCode: input.code };
  }
  if (!readiness.ready || !apiKey || !from) {
    throw new AppError(
      503,
      readiness.issues[0]?.code ?? "EMAIL_NOT_CONFIGURED",
      readiness.issues[0]?.message ?? "邮件服务尚未配置",
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: subjects[input.purpose],
        text: `你的验证码是 ${input.code}，10 分钟内有效。请勿将验证码告知他人。`,
        html: `<p>你的验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${input.code}</p><p>10 分钟内有效。请勿将验证码告知他人。</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError(502, "EMAIL_DELIVERY_FAILED", "验证码邮件发送失败，请稍后重试");
  }
  if (!response.ok) {
    throw new AppError(502, "EMAIL_DELIVERY_FAILED", "验证码邮件发送失败，请稍后重试");
  }
  return { delivery: "email" };
}
