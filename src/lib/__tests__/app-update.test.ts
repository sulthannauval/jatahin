import { describe, expect, it } from "vitest";
import { isNewer, parseVersion, pickUpdate } from "../app-update";

const apk = (v: string, extra: object = {}) => ({
  name: `jatahin-${v}.apk`,
  browser_download_url: `https://github.com/sulthannauval/jatahin/releases/download/android-v${v}/jatahin-${v}.apk`,
  size: 4_200_000,
  ...extra,
});
const sha = "a".repeat(64);

describe("versions", () => {
  it("reads release tags, with or without v", () => {
    expect(parseVersion("android-v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("ios-v1.2.3")).toBeNull();
    expect(parseVersion("1.10.0")).toEqual([1, 10, 0]);
    expect(parseVersion("1.2")).toBeNull();
    expect(parseVersion("v1.2.3-beta")).toBeNull();
  });

  it("compares part by part, not as text", () => {
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("0.9.0", "1.0.0")).toBe(false);
    expect(isNewer("1.0.0", "0.0.0")).toBe(true);
    expect(isNewer("junk", "1.0.0")).toBe(false);
  });
});

describe("pickUpdate", () => {
  it("offers a newer release with the asset digest", () => {
    const u = pickUpdate({ tag_name: "android-v1.1.0", body: " Baca kartu Brizzi \n", assets: [apk("1.1.0", { digest: `sha256:${sha.toUpperCase()}` })] }, "1.0.0");
    expect(u).toEqual({ version: "1.1.0", notes: "Baca kartu Brizzi", apkUrl: apk("1.1.0").browser_download_url, sha256: sha, shaUrl: undefined, size: 4_200_000 });
  });

  it("falls back to the .sha256 file when there is no digest", () => {
    const shaFile = { name: "jatahin-1.1.0.apk.sha256", browser_download_url: "https://github.com/sulthannauval/jatahin/releases/download/android-v1.1.0/jatahin-1.1.0.apk.sha256" };
    const u = pickUpdate({ tag_name: "v1.1.0", assets: [apk("1.1.0"), shaFile] }, "1.0.0");
    expect(u?.sha256).toBeUndefined();
    expect(u?.shaUrl).toBe(shaFile.browser_download_url);
  });

  it("offers nothing it can't verify, nothing older, and no drafts or pre-releases", () => {
    expect(pickUpdate({ tag_name: "v1.1.0", assets: [apk("1.1.0")] }, "1.0.0")).toBeNull();
    expect(pickUpdate({ tag_name: "v1.0.0", assets: [apk("1.0.0", { digest: `sha256:${sha}` })] }, "1.0.0")).toBeNull();
    expect(pickUpdate({ tag_name: "v2.0.0", prerelease: true, assets: [apk("2.0.0", { digest: `sha256:${sha}` })] }, "1.0.0")).toBeNull();
    expect(pickUpdate({ tag_name: "v2.0.0", assets: [] }, "1.0.0")).toBeNull();
    expect(pickUpdate({ message: "Not Found" }, "1.0.0")).toBeNull();
    expect(pickUpdate(null, "1.0.0")).toBeNull();
  });
});
