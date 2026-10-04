import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentLink } from "../../components/navigation/document-link";

describe("document navigation compatibility fallback", () => {
  it("renders a native anchor with standard browser link semantics", () => {
    const html = renderToStaticMarkup(createElement(DocumentLink, {
      href: "/login", target: "_blank", rel: "noopener", "aria-label": "登录",
    }, "登录"));
    assert.match(html, /^<a /);
    assert.match(html, /href="\/login"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener"/);
    assert.doesNotMatch(html, /<button|prefetch/);
  });
  it("keeps all current page links off the broken next/link dynamic namespace", () => {
    for (const path of ["app/login/page.tsx", "app/profile/page.tsx", "components/auth/user-menu.tsx",
      "components/account/guest-claim-view.tsx", "components/account/session-manager.tsx"]) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      assert.ok(source.includes("@/components/navigation/document-link"), path);
      assert.ok(!source.includes('from "next/link"'), path);
    }
  });
});
