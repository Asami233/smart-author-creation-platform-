export const ACCOUNT_DELETION_SQL = [
  "DELETE FROM backup_import_jobs WHERE owner_id = ?",
  "DELETE FROM workspace_preferences WHERE owner_id = ?",
  "DELETE FROM ai_provider_configs WHERE owner_id = ?",
  "DELETE FROM ai_usage_daily WHERE owner_id = ?",
  "DELETE FROM works WHERE owner_id = ?",
  "DELETE FROM auth_challenges WHERE email = ?",
  "DELETE FROM auth_sessions WHERE user_id = ?",
  "DELETE FROM auth_credentials WHERE user_id = ?",
  "DELETE FROM auth_users WHERE id = ? AND email = ?",
] as const;
