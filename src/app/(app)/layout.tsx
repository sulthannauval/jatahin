import { Suspense } from "react";
import { BottomNav, BottomNavLive, MobileBar, Sidebar, SidebarNav } from "@/components/nav";
import { TxProvider } from "@/components/tx-context";
import { TxSheetHost } from "@/components/tx-sheet-host";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <TxProvider>
      <div className="flex min-h-dvh">
        <Suspense fallback={<Sidebar />}><SidebarNav /></Suspense>
        {/* Canvas: fluid, one 24px gutter (16px on phones), content capped at 1240px. */}
        <main className="min-w-0 flex-1 px-4 pt-3 pb-28 sm:px-6 md:pt-9 md:pr-8 md:pb-12 md:pl-4">
          <div className="mx-auto max-w-[1240px]">
            <MobileBar />
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
