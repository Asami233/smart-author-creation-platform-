import { getD1 } from "@/db";

export async function first<T>(sql: string, ...bindings: unknown[]): Promise<T | null> {
  return (await getD1().prepare(sql).bind(...bindings).first<T>()) ?? null;
}

export async function all<T>(sql: string, ...bindings: unknown[]): Promise<T[]> {
  const result = await getD1().prepare(sql).bind(...bindings).all<T>();
  return result.results;
}

export async function run(sql: string, ...bindings: unknown[]): Promise<D1Result<unknown>> {
  return getD1().prepare(sql).bind(...bindings).run();
}

export function statement(sql: string, ...bindings: unknown[]): D1PreparedStatement {
  return getD1().prepare(sql).bind(...bindings);
}

export async function batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
  return getD1().batch(statements);
}
