import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeBindings = {
  DB?: D1Database;
  APP_ENCRYPTION_KEY?: string;
  AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
};

function bindings(): RuntimeBindings {
  return env as unknown as RuntimeBindings;
}

export function getD1(): D1Database {
  const database = bindings().DB;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Build the project and apply local migrations before using the API.",
    );
  }
  return database;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getServerSecret(
  name: "APP_ENCRYPTION_KEY" | "AUTH_SECRET" | "RESEND_API_KEY" | "AUTH_EMAIL_FROM",
): string | null {
  const value = bindings()[name]?.trim();
  return value || null;
}
