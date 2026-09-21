import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashChallenge,
  hashPassword,
  randomToken,
  randomVerificationCode,
  timingSafeEqual,
  verifyPassword,
// @ts-expect-error Direct Node type-stripping requires an explicit .ts extension.
} from "../../server/auth/security.ts";
import {
  passwordResetSchema,
  registerStartSchema,
  updateProfileSchema,
// @ts-expect-error Direct Node type-stripping requires an explicit .ts extension.
} from "../../contracts/auth.ts";

describe("auth security", () => {
  it("hashes and verifies a password without storing plaintext", async () => {
    const result = await hashPassword("writer2026", undefined, 1_000);
    assert.notEqual(result.hash, "writer2026");
    assert.equal(await verifyPassword("writer2026", result.hash, result.salt, result.iterations), true);
    assert.equal(await verifyPassword("wrong2026", result.hash, result.salt, result.iterations), false);
  });

  it("binds verification hashes to purpose and email", async () => {
    const first = await hashChallenge("x".repeat(32), "register", "a@example.com", "123456");
    const second = await hashChallenge("x".repeat(32), "login", "a@example.com", "123456");
    assert.equal(timingSafeEqual(first, first), true);
    assert.equal(timingSafeEqual(first, second), false);
  });

  it("generates URL-safe tokens and six-digit codes", () => {
    assert.match(randomToken(), /^[A-Za-z0-9_-]{40,}$/);
    assert.match(randomVerificationCode(), /^\d{6}$/);
  });
});

describe("auth contracts", () => {
  it("normalizes email and requires a strong-enough password", () => {
    const parsed = registerStartSchema.parse({
      email: " Writer@Example.COM ",
      password: "novel2026",
      penName: "青墨",
    });
    assert.equal(parsed.email, "writer@example.com");
    assert.equal(registerStartSchema.safeParse({ email: "x@example.com", password: "12345678", penName: "x" }).success, false);
  });

  it("validates reset codes and non-empty profile patches", () => {
    assert.equal(passwordResetSchema.safeParse({ email: "a@b.com", code: "12345", newPassword: "novel2026" }).success, false);
    assert.equal(updateProfileSchema.safeParse({}).success, false);
  });
});
