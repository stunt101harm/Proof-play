import {
  securityHeaders,
  withSecurityHeaders,
} from "../apps/web/lib/security-headers";
import { describe, expect, it } from "vitest";

describe("web security headers", () => {
  it("applies browser hardening without replacing response metadata", async () => {
    const response = withSecurityHeaders(
      new Response("ok", {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("denies unused browser capabilities", () => {
    expect(securityHeaders().get("permissions-policy")).toContain("camera=()");
  });
});
