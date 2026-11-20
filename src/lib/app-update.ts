/** Releases of the Android app live in a public repository, so the app can check them without signing in. */
export const RELEASES_REPO = "sulthannauval/jatahin-releases";
export const RELEASES_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`;

type Version = [number, number, number];

/** "v1.2.3" or "1.2.3" -> [1, 2, 3]; anything else -> null. */
export function parseVersion(s: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export interface Update {
  version: string;
  notes: string;
  apkUrl: string;
  /** From the asset's digest; when GitHub gives none, shaUrl points at the .sha256 file the release CI uploads. */
  sha256?: string;
  shaUrl?: string;
  size: number;
}

interface Asset { name?: unknown; browser_download_url?: unknown; digest?: unknown; size?: unknown }

/** The update to offer from GitHub's "latest release" JSON, or null when there is none newer or it can't be checked. */
export function pickUpdate(release: unknown, current: string): Update | null {
  if (!release || typeof release !== "object") return null;
  const r = release as { tag_name?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
  if (r.draft || r.prerelease || typeof r.tag_name !== "string") return null;
  const version = parseVersion(r.tag_name)?.join(".");
  if (!version || !isNewer(version, current)) return null;
  const assets = (Array.isArray(r.assets) ? r.assets : []) as Asset[];
  const apk = assets.find((a) => typeof a.name === "string" && a.name.endsWith(".apk") && typeof a.browser_download_url === "string");
  if (!apk) return null;
  const digest = typeof apk.digest === "string" ? /^sha256:([0-9a-f]{64})$/i.exec(apk.digest)?.[1]?.toLowerCase() : undefined;
  const shaAsset = assets.find((a) => a.name === `${apk.name}.sha256` && typeof a.browser_download_url === "string");
  if (!digest && !shaAsset) return null;
  return {
    version,
    notes: typeof r.body === "string" ? r.body.trim() : "",
    apkUrl: apk.browser_download_url as string,
    sha256: digest,
    shaUrl: digest ? undefined : (shaAsset!.browser_download_url as string),
    size: typeof apk.size === "number" ? apk.size : 0,
  };
}
