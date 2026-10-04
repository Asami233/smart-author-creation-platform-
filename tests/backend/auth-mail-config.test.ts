import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateEmailDeliveryReadiness,
  isValidEmailFrom,
} from "../../server/auth/mail-config";

describe("authentication email readiness", () => {
  it("allows a development code only on local requests with no mail configuration", () => {
    const result = evaluateEmailDeliveryReadiness({ apiKey: null, from: null, localRequest: true });
    assert.equal(result.ready, true);
    assert.equal(result.mode, "development");
    assert.equal(result.devCodeEnabled, true);
  });

  it("rejects missing mail configuration on a public request", () => {
    const result = evaluateEmailDeliveryReadiness({ apiKey: null, from: null, localRequest: false });
    assert.equal(result.ready, false);
    assert.equal(result.mode, "unavailable");
    assert.equal(result.devCodeEnabled, false);
    assert.equal(result.issues[0]?.code, "EMAIL_NOT_CONFIGURED");
  });

  it("does not silently fall back when only half of the provider is configured", () => {
    for (const config of [
      { apiKey: "re_example", from: null },
      { apiKey: null, from: "auth@example.com" },
    ]) {
      const result = evaluateEmailDeliveryReadiness({ ...config, localRequest: true });
      assert.equal(result.ready, false);
      assert.equal(result.devCodeEnabled, false);
      assert.equal(result.issues[0]?.code, "EMAIL_CONFIG_PARTIAL");
    }
  });

  it("accepts plain and named senders while rejecting injection and malformed addresses", () => {
    assert.equal(isValidEmailFrom("auth@example.com"), true);
    assert.equal(isValidEmailFrom("智能作者 <auth@example.com>"), true);
    assert.equal(isValidEmailFrom("智能作者 <auth@example.com>\r\nBcc: victim@example.com"), false);
    assert.equal(isValidEmailFrom("not-an-email"), false);
  });

  it("uses real email even for local requests when the full provider is configured", () => {
    const result = evaluateEmailDeliveryReadiness({
      apiKey: "re_example",
      from: "智能作者 <auth@example.com>",
      localRequest: true,
    });
    assert.equal(result.ready, true);
    assert.equal(result.mode, "email");
    assert.equal(result.provider, "resend");
    assert.equal(result.devCodeEnabled, false);
    assert.deepEqual(result.issues, []);
  });
});
