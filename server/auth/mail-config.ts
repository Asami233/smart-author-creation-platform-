import type { EmailDeliveryReadiness } from "@/contracts/auth";

type EmailConfigInput = {
  apiKey: string | null;
  from: string | null;
  localRequest: boolean;
};

const ADDRESS_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidEmailFrom(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || normalized.length > 320 || /[\r\n]/.test(normalized)) return false;
  const angleAddress = normalized.match(/^([^<>]{1,100}\s*)?<([^<>]+)>$/)?.[2];
  return ADDRESS_PATTERN.test((angleAddress ?? normalized).trim());
}

export function evaluateEmailDeliveryReadiness(input: EmailConfigInput): EmailDeliveryReadiness {
  const hasApiKey = Boolean(input.apiKey?.trim());
  const hasFrom = Boolean(input.from?.trim());
  const missing: EmailDeliveryReadiness["missing"] = [];
  if (!hasApiKey) missing.push("RESEND_API_KEY");
  if (!hasFrom) missing.push("AUTH_EMAIL_FROM");

  if (!hasApiKey && !hasFrom && input.localRequest) {
    return {
      ready: true,
      mode: "development",
      provider: "none",
      localRequest: true,
      devCodeEnabled: true,
      missing,
      issues: [],
    };
  }

  const issues: EmailDeliveryReadiness["issues"] = [];
  if (hasApiKey !== hasFrom) {
    issues.push({
      code: "EMAIL_CONFIG_PARTIAL",
      message: "RESEND_API_KEY 与 AUTH_EMAIL_FROM 必须同时配置",
    });
  } else if (!hasApiKey) {
    issues.push({
      code: "EMAIL_NOT_CONFIGURED",
      message: "公开环境必须配置真实邮件服务",
    });
  } else if (!isValidEmailFrom(input.from!)) {
    issues.push({
      code: "EMAIL_FROM_INVALID",
      message: "AUTH_EMAIL_FROM 不是有效的发件人地址",
    });
  }

  return {
    ready: issues.length === 0,
    mode: issues.length === 0 ? "email" : "unavailable",
    provider: hasApiKey && hasFrom ? "resend" : "none",
    localRequest: input.localRequest,
    devCodeEnabled: false,
    missing,
    issues,
  };
}
