import { rp } from "@/lib/money";
import { cn } from "@/lib/cn";

type Line = { label: string; amount: number; sign: "+" | "−" | null };

/**
 * The money available to spend, read like a bank balance: the largest figure on the home page, in its own card.
 * The ledger beside it shows how the figure was reached, so it can be checked against the bank.
 */
export function BalanceCard({
  label, balance, lines, note,
}: { label: string; balance: number; lines: Line[]; note?: string }) {
  return (
    <section
      aria-label={label}
      className={cn("grid rounded-2xl border border-line bg-surface", lines.length > 0 && "lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-center")}
    >
      <div className="min-w-0 px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-sm text-muted">{label}</p>
        <p className={cn("num mt-1.5 text-[36px] leading-[1.1] font-bold tracking-[-0.03em] whitespace-nowrap", balance < 0 && "text-neg")}>
          {balance < 0 ? "−" : ""}{rp(Math.abs(balance))}
        </p>
        {note && <p className="mt-2 text-[13px] leading-5 text-muted">{note}</p>}
      </div>

      {/* How the balance was reached: a rise in green with a plus, a fall in ink with a minus */}
      {lines.length > 0 && (
        <dl className="num border-t border-line px-5 py-3 text-sm sm:px-6 lg:self-stretch lg:flex lg:flex-col lg:justify-center lg:border-t-0 lg:border-l lg:py-5">
          {lines.map((l) => (
            <div key={l.label} className="flex min-h-9 items-baseline justify-between gap-4 border-b border-rule py-2 last:border-b-0">
              <dt className="text-muted">{l.label}</dt>
              <dd className={cn("text-right", l.sign === "+" && l.amount > 0 && "text-pos")}>
                {l.sign && l.amount > 0 ? `${l.sign}${rp(l.amount)}` : rp(l.amount)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
