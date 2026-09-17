export const LOCAL_OWNER_ID = "local-author";

export function ownerIdForRequest(_request: Request): string {
  // M6 will replace this with authenticated identity. Keeping this constant
  // prevents callers from impersonating another owner through request headers.
  return LOCAL_OWNER_ID;
}
