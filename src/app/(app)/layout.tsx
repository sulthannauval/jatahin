import { Suspense } from "react";
import { BottomNav, BottomNavLive, MobileBar, Sidebar, SidebarNav } from "@/components/nav";
import { TxProvider } from "@/components/tx-context";
import { TxSheetHost } from "@/components/tx-sheet-host";
import { AppUpdate } from "@/components/native/app-update";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <TxProvider>
      {/* In the Android app the page runs edge to edge: keep scrolled content from showing behind the status bar. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[var(--inset-top)] bg-ground md:hidden" />
      <div className="flex min-h-dvh">
        <Suspense fallback={<Sidebar />}><SidebarNav /></Suspense>
        {/* Canvas: fluid, one 24px gutter (16px on phones), content capped at 1240px. */}
        <main className="min-w-0 flex-1 px-4 pt-[calc(0.75rem+var(--inset-top))] pb-28 sm:px-6 md:pt-9 md:pr-8 md:pb-12 md:pl-4">
          <div className="mx-auto max-w-[1240px]">
            <MobileBar />
            <AppUpdate />
            {children}
          </div>
        </main>
      </div>
      <Suspense fallback={<BottomNav />}><BottomNavLive /></Suspense>
      <Suspense>
        <TxSheetHost />
      </Suspense>
    </TxProvider>
  );
}
