import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Rules and alignment: grey sentence-case header, no band, no zebra, right-aligned tabular figures. */
export function Table({ className, ...p }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...p} />
    </div>
  );
}

export function Th({ className, num, ...p }: ComponentProps<"th"> & { num?: boolean }) {
  return (
    <th
      className={cn(
        "h-9 border-b border-line bg-surface px-3 text-left text-xs font-normal whitespace-nowrap text-muted first:sticky first:left-0 first:z-[1] first:pl-5 last:pr-5",
        num && "text-right",
        className,
      )}
      {...p}
    />
  );
}

export function Td({ className, num, ...p }: ComponentProps<"td"> & { num?: boolean }) {
  return <td className={cn("h-11 border-b border-rule px-3 whitespace-nowrap first:sticky first:left-0 first:z-[1] first:bg-surface first:pl-5 last:pr-5", num && "num text-right", className)} {...p} />;
}

/** Total row: the money in bold, a stronger rule above. */
export function TotalRow({ className, ...p }: ComponentProps<"tr">) {
  return <tr className={cn("[&>td]:border-t [&>td]:border-b-0 [&>td]:border-t-line [&>td]:font-medium [&>td.num]:font-bold", className)} {...p} />;
}
