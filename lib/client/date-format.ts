export function formatLocalDateTime(value: string | null | undefined, fallback = "时间未知"): string {
  if (!value) return fallback;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return fallback;

  return timestamp.toLocaleString("zh-CN");
}
