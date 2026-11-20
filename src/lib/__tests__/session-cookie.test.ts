import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Production names the cookie __Host-mf_session. A browser only drops such a cookie when the clearing
// Set-Cookie is also Secure with Path=/; before this was fixed it kept the old token, and a session ended
// elsewhere bounced between the app and /login forever.
const BASE = "https://jatahin.test";

describe("clearing the session cookie in production", () => {
  let mod: {
    session: typeof import("../auth/session");
    proxy: typeof import("../../proxy").proxy;
    expired: typeof import("../../app/auth/expired/route").GET;
  };

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "x".repeat(40));
    vi.resetModules();
    mod = {
      session: await import("../auth/session"),
      proxy: (await import("../../proxy")).proxy,
      expired: (await import("../../app/auth/expired/route")).GET,
    };
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const request = async (path: string) => {
    const { token } = await mod.session.createSessionToken(1);
    return new NextRequest(BASE + path, { headers: { cookie: `__Host-mf_session=${token}` } });
  };
  const cleared = (res: Response) => {
    const c = res.headers.get("set-cookie") ?? "";
    return c.startsWith("__Host-mf_session=;") && /Secure/i.test(c) && /Path=\//.test(c) && /Max-Age=0/i.test(c);
  };

  it("drops the cookie when a session has ended", async () => {
    const res = mod.expired(await request("/auth/expired"));
    expect(res.headers.get("location")).toBe(`${BASE}/login?expired=1`);
    expect(cleared(res)).toBe(true);
  });

  it("lets /login?expired=1 through and drops the cookie instead of sending it back to the app", async () => {
    const res = await mod.proxy(await request("/login?expired=1"));
    expect(res.headers.get("location")).toBeNull();
    expect(cleared(res)).toBe(true);
  });

  it("still sends a signed-in visitor from /login to the app", async () => {
    const res = await mod.proxy(await request("/login"));
    expect(res.headers.get("location")).toBe(`${BASE}/`);
  });
});
