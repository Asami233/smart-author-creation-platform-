/** Each accepted generation attempt consumes one daily slot, including cancellations and provider errors. */
export const RESERVE_AI_REQUEST_SQL = `
  INSERT INTO ai_usage_daily
    (id, owner_id, usage_date, request_count, input_tokens, output_tokens, created_at, updated_at)
  VALUES (?, ?, ?, 1, 0, 0, ?, ?)
  ON CONFLICT(owner_id, usage_date) DO UPDATE SET
    request_count = ai_usage_daily.request_count + 1,
    updated_at = excluded.updated_at
  WHERE ai_usage_daily.request_count < ?
  RETURNING request_count`;

export function reportedTokens(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : 0;
}
