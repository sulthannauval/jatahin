import { describe, expect, it } from "vitest";
import { dueDate, dueLabel, matchesQuery, matchPayment, openPeriods, periodFor, rankForBill, reservedBills, sharesName, type BillInfo, type MatchCandidate } from "../bills";

const bpjs: BillInfo = { id: 1, name: "BPJS", categoryId: 10, schedule: "date", dueDay: 1, createdOn: "2026-10-28" };
const listrik: BillInfo = { id: 2, name: "Listrik PLN", categoryId: 20, schedule: "payday", dueDay: null, createdOn: "2026-10-28" };

describe("dueDate and periodFor", () => {
  it("uses the last day of a short month", () => {
    expect(dueDate("2026-11", 31)).toBe("2026-11-30");
    expect(dueDate("2027-02", 30)).toBe("2027-02-28");
  });
  it("puts an early payment in the month it is due", () => {
    expect(periodFor("2026-10-31", 1)).toBe("2026-11");
    expect(periodFor("2026-11-03", 1)).toBe("2026-11");
    expect(periodFor("2026-10-10", 10)).toBe("2026-10");
  });
});

describe("openPeriods", () => {
  it("starts the day before a dated tagihan is due", () => {
    expect(openPeriods(bpjs, 10, new Set(), "2026-10-30")).toEqual([]);
    expect(openPeriods(bpjs, 10, new Set(), "2026-10-31")).toEqual([{ billId: 1, month: "2026-11", due: "2026-11-01" }]);
  });
  it("stays until paid or skipped, and never asks for months before the tagihan existed", () => {
    expect(openPeriods(bpjs, 10, new Set(), "2026-11-20").map((p) => p.month)).toEqual(["2026-11"]);
    expect(openPeriods(bpjs, 10, new Set(["2026-11"]), "2026-11-20")).toEqual([]);
    expect(openPeriods(bpjs, 10, new Set(), "2026-12-05").map((p) => p.month)).toEqual(["2026-11", "2026-12"]);
  });
  it("follows the payday for tagihan pas gajian, and waits when it isn't set", () => {
    expect(openPeriods(listrik, 10, new Set(), "2026-11-09", 0)).toEqual([]);
    expect(openPeriods(listrik, 10, new Set(), "2026-11-10", 0)).toEqual([{ billId: 2, month: "2026-11", due: "2026-11-10" }]);
    expect(openPeriods(listrik, null, new Set(), "2026-11-10", 0)).toEqual([]);
  });
});

describe("dueLabel", () => {
  it("counts days before and after", () => {
    expect(dueLabel("2026-11-01", "2026-10-31").text).toBe("Besok");
    expect(dueLabel("2026-11-01", "2026-11-01").text).toBe("Hari ini");
    expect(dueLabel("2026-11-01", "2026-11-03")).toEqual({ text: "Telat 2 hari", tone: "late" });
  });
});

describe("names", () => {
  it("finds past entries by the start of each word", () => {
    expect(matchesQuery("Listrik PLN", "listrik")).toBe(true);
    expect(matchesQuery("Listrik", "listrik pln")).toBe(false);
    expect(matchesQuery("Air PDAM", "air")).toBe(true);
    expect(matchesQuery("Bayar", "bayar")).toBe(false);
  });
  it("matches whole words only", () => {
    expect(sharesName("BPJS Kesehatan", "BPJS")).toBe(true);
    expect(sharesName("Airpods", "Air PDAM")).toBe(false);
  });
});

describe("matchPayment", () => {
  const open = (b: BillInfo, due: string, last: number | null): MatchCandidate => ({ billId: b.id, month: due.slice(0, 7), due, name: b.name, categoryId: b.categoryId, lastAmount: last });
  const air: BillInfo = { id: 3, name: "Air PDAM", categoryId: 20, schedule: "payday", dueDay: null, createdOn: "2026-10-28" };

  it("marks the only tagihan in the category when the amount is close", () => {
    const m = matchPayment({ date: "2026-11-02", categoryId: 10, amount: 100_000, description: "" }, [open(bpjs, "2026-11-01", 100_000)]);
    expect(m?.billId).toBe(1);
  });
  it("needs the name or the amount", () => {
    expect(matchPayment({ date: "2026-11-02", categoryId: 10, amount: 35_000, description: "Obat batuk" }, [open(bpjs, "2026-11-01", 100_000)])).toBeNull();
  });
  it("asks instead of guessing between two tagihan of one category", () => {
    const cands = [open(listrik, "2026-11-10", 519_280), open(air, "2026-11-10", 450_000)];
    expect(matchPayment({ date: "2026-11-10", categoryId: 20, amount: 480_000, description: "" }, cands)).toBeNull();
    expect(matchPayment({ date: "2026-11-10", categoryId: 20, amount: 480_000, description: "Listrik" }, cands)?.billId).toBe(2);
  });
  it("ignores payments long before the tagihan is due", () => {
    expect(matchPayment({ date: "2026-10-20", categoryId: 10, amount: 100_000, description: "BPJS" }, [open(bpjs, "2026-11-01", 100_000)])).toBeNull();
  });
});

describe("rankForBill", () => {
  it("puts the likeliest payment first", () => {
    const rows = [
      { id: 1, categoryId: 99, amount: 42_500, description: "Indomaret", date: "2026-11-02" },
      { id: 2, categoryId: 10, amount: 35_000, description: "Obat batuk", date: "2026-10-30" },
      { id: 3, categoryId: 10, amount: 100_000, description: "BPJS Kesehatan", date: "2026-11-01" },
    ];
    expect(rankForBill(rows, { categoryId: 10, name: "BPJS" }, 100_000).map((r) => r.id)).toEqual([3, 2, 1]);
  });
});

describe("reservedBills", () => {
  const wifi = { id: 3, name: "Wifi", categoryId: 20, schedule: "date" as const, dueDay: 8, createdOn: "2026-10-20", lastAmount: 257_713, settledMonths: new Set<string>() };
  const bpjs1 = { ...bpjs, lastAmount: 100_000, settledMonths: new Set<string>() };
  const listrik1 = { ...listrik, lastAmount: 519_280, settledMonths: new Set<string>() };

  it("counts dated tagihan due before payday, late ones too, but not payday ones before the salary", () => {
    const r = reservedBills([bpjs1, wifi, listrik1], 10, "2026-11-05", false);
    expect(r.until).toBe("2026-11-10");
    expect(r.items.map((i) => `${i.billId}:${i.month}`)).toEqual(["1:2026-11", "3:2026-11"]);
    expect(r.total).toBe(357_713);
  });
  it("after the salary counts payday tagihan and everything due before the next payday", () => {
    const r = reservedBills([bpjs1, wifi, listrik1], 10, "2026-11-10", true);
    expect(r.until).toBe("2026-12-10");
    expect(r.items.map((i) => `${i.billId}:${i.month}`).sort()).toEqual(["1:2026-11", "1:2026-12", "2:2026-11", "3:2026-11", "3:2026-12"]);
  });
  it("an early salary covers until the payday after", () => {
    expect(reservedBills([wifi], 10, "2026-11-02", true).until).toBe("2026-12-10");
    expect(reservedBills([wifi], 10, "2026-11-02", false).until).toBe("2026-11-10");
  });
  it("leaves out what is paid or skipped", () => {
    const paid = { ...wifi, settledMonths: new Set(["2026-11"]) };
    expect(reservedBills([paid], 10, "2026-11-05", false).items).toEqual([]);
  });
  it("uses the end of the month without a payday", () => {
    expect(reservedBills([wifi], null, "2026-11-05", false).until).toBe("2026-11-30");
  });
});
