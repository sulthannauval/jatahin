"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { ChartNoAxesCombined, ChartPie, House, LogOut, Plus, ReceiptText, Settings2, SmartphoneNfc, WalletCards } from "lucide-react";
import { logout } from "@/app/actions";
import { cn } from "@/lib/cn";
import { useTx } from "./tx-context";
import { ThemeToggle } from "./theme-toggle";
import { Mark } from "./brand";
import { useNativeApp } from "./native/plugins";

// Each icon is the thing itself: a receipt for entries, portions of a pie for jatah (like the mark),
// a wallet holding cards for kantong, a rising line for reports.
const items = [
  { href: "/", label: "Beranda", short: "Beranda", icon: House },
  { href: "/transaksi", label: "Transaksi", short: "Transaksi", icon: ReceiptText },
  { href: "/jatah", label: "Jatah", short: "Jatah", icon: ChartPie },
  { href: "/kantong", label: "Kantong", short: "Kantong", icon: WalletCards },
  { href: "/laporan", label: "Laporan", short: "Laporan", icon: ChartNoAxesCombined },
  { href: "/pengaturan", label: "Pengaturan", short: "Atur", icon: Settings2 },
];

/** Which item is current. `path` null: not known yet (the shell rendered before the URL is read). */
const activeIn = (path: string | null) => (href: string) => (path === null ? false : href === "/" ? path === "/" : path.startsWith(href));

/**
 * The navigation reads the URL, which a route with params (/kantong/[id]) only knows per request. The layout
 * renders these with no item marked inside <Suspense>, then the URL-aware version.
 */
export function SidebarNav() {
  return <Sidebar path={usePathname()} />;
}
export function BottomNavLive() {
  return <BottomNav path={usePathname()} />;
}


export function Sidebar({ path = null }: { path?: string | null }) {
  const isActive = activeIn(path);
  const { openTx } = useTx();
  const [leaving, start] = useTransition();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col px-3 pt-6 pb-4 md:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
        <Mark className="size-7" />
        <span className="leading-tight">
          <span className="block text-[15px] font-medium">Jatahin!</span>
          <span className="block text-xs text-muted">Atur Jatah, Baru Belanja</span>
        </span>
      </Link>
      <button
        onClick={() => openTx()}
        className="mb-5 flex h-9 cursor-pointer items-center gap-2 rounded-full bg-primary px-3 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 active:scale-[0.98]"
      >
        <Plus className="size-4" strokeWidth={2} /> Catat transaksi
        <kbd className="ml-auto font-sans text-xs font-normal opacity-60">N</kbd>
      </button>
      <nav className="space-y-0.5" aria-label="Navigasi utama">
        {items.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href} active={isActive(href)} icon={<Icon className="size-4" strokeWidth={1.5} />}>{label}</NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-0.5">
        <ThemeToggle className="mb-3" />
        <NavLink href="/pengaturan" active={isActive("/pengaturan")} icon={<Settings2 className="size-4" strokeWidth={1.5} />}>Pengaturan</NavLink>
        <button
          onClick={() => start(() => logout())}
          disabled={leaving}
          className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-full px-3 text-sm text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          <LogOut className="size-4" strokeWidth={1.5} /> Keluar
        </button>
      </div>
    </aside>
  );
}

function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-full px-3 text-sm transition-colors",
        active ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-2 hover:bg-raised hover:text-ink",
      )}
    >
      {icon} {children}
    </Link>
  );
}

/** Phone: a bottom bar of five destinations; the centre button is the screen's one primary action. */
export function BottomNav({ path = null }: { path?: string | null }) {
  const isActive = activeIn(path);
  const { openTx } = useTx();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navigasi utama">
      <div className="mx-auto flex max-w-lg items-center px-1">
        <BottomItem item={items[0]} active={isActive(items[0].href)} />
        <BottomItem item={items[1]} active={isActive(items[1].href)} />
        <div className="flex flex-1 justify-center">
          <button onClick={() => openTx()} aria-label="Catat transaksi" className="grid size-12 cursor-pointer place-items-center rounded-full bg-primary text-on-primary transition-transform active:scale-95">
            <Plus className="size-5" strokeWidth={2} />
          </button>
        </div>
        <BottomItem item={items[2]} active={isActive(items[2].href)} />
        <BottomItem item={items[3]} active={isActive(items[3].href)} />
      </div>
    </nav>
  );
}

function BottomItem({ item: { href, short, icon: Icon }, active }: { item: (typeof items)[number]; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-medium text-brand-ink" : "text-muted")}>
      <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
      {short}
    </Link>
  );
}

/** Phone header: the product's mark, then Laporan (which has no room in the bottom bar) and settings. In the
 * Android app, Cek E-Money comes first. */
export function MobileBar() {
  const native = useNativeApp();
  return (
    <div className="mb-4 flex h-10 items-center justify-between md:hidden">
      <Link href="/" className="flex items-center gap-1.5">
        <Mark className="size-[18px]" />
        <span className="text-[15px] font-medium">Jatahin!</span>
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle compact />
        {native && (
          <Link href="/cek-emoney" aria-label="Cek E-Money" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-raised">
            <SmartphoneNfc className="size-5" strokeWidth={1.5} />
          </Link>
        )}
        <Link href="/laporan" aria-label="Laporan" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-raised">
          <ChartNoAxesCombined className="size-5" strokeWidth={1.5} />
        </Link>
        <Link href="/pengaturan" aria-label="Pengaturan" className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-raised">
          <Settings2 className="size-5" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
