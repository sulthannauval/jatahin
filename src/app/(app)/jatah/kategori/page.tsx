import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { getCategories } from "@/lib/queries";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "Kategori" };

/** The categories every transaction and every jatah line uses. Hidden ones stay in the history. */
export default async function KategoriPage() {
  await requireSession();
  const cats = await getCategories(await getDb(), true);
  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/jatah" className="-ml-1 inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-1 text-sm text-ink-2 transition-colors hover:bg-raised hover:text-ink">
        <ChevronLeft className="size-4" strokeWidth={1.75} /> Jatah
      </Link>
      <h1 className="mt-1 text-[22px] leading-8 font-medium tracking-[-0.01em] md:text-2xl">Kategori</h1>
      <p className="mt-0.5 mb-5 text-sm text-muted">Yang disembunyikan tetap ada di riwayat.</p>
      <CategoryManager categories={cats} />
    </div>
  );
}
