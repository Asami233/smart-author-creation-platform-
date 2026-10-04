import type { ComponentProps } from "react";

/**
 * Document navigation intentionally bypasses vinext beta.5's broken production
 * Link dynamic-import namespace. It also preserves native beforeunload guards.
 * Reconsider after the framework's prefetch AND click paths pass browser tests.
 */
export function DocumentLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
