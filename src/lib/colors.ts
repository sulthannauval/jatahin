// One colour per category type, from the validated chart slots. Used as small marks next to names, never as text.
const GROUP_COLORS: Record<string, string> = {
  Wajib: "var(--c-blue)",
  Kebutuhan: "var(--c-aqua)",
  Keinginan: "var(--c-orange)",
  Saving: "var(--c-yellow)",
  Lainnya: "var(--c-pink)",
  Rutin: "var(--c-aqua)",
  "Tidak Rutin": "var(--c-blue)",
  "Bukan Income": "var(--c-slate)",
};

export function groupColor(group: string | null | undefined): string {
  return (group && GROUP_COLORS[group]) || "var(--c-slate)";
}
