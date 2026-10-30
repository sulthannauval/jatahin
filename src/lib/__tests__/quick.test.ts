import { describe, expect, it } from "vitest";
import { frequentEntries, guessCategory, type DescriptionUse } from "../quick";

const tx = (id: number, date: string, categoryId: number, description: string, amount: number, potId: number | null = null) =>
  ({ id, date, categoryId, potId, description, amount });

describe("frequentEntries", () => {
  it("ranks repeated entries by count and keeps the latest amount", () => {
    const rows = [
      tx(1, "2026-08-05", 3, "Apple Music", 19000),
      tx(2, "2026-09-05", 3, "apple music ", 19000),
      tx(3, "2026-10-05", 3, "Apple Music", 21000),
      tx(4, "2026-10-01", 4, "", 120000),
      tx(5, "2026-10-15", 4, "", 125000),
      tx(6, "2026-10-20", 5, "Sekali saja", 50000),
    ];
    expect(frequentEntries(rows, 5)).toEqual([
      { categoryId: 3, potId: null, description: "Apple Music", amount: 21000, n: 3 },
      { categoryId: 4, potId: null, description: "", amount: 125000, n: 2 },
    ]);
  });

  it("treats the same category with a different pot as a different entry", () => {
    const rows = [tx(1, "2026-10-01", 8, "", 200000, 1), tx(2, "2026-10-02", 8, "", 200000, 2), tx(3, "2026-10-03", 8, "", 100000, 2)];
    expect(frequentEntries(rows, 5)).toEqual([{ categoryId: 8, potId: 2, description: "", amount: 100000, n: 2 }]);
  });

  it("breaks ties by the most recent use and respects the limit", () => {
    const rows = [tx(1, "2026-09-01", 1, "A", 1), tx(2, "2026-09-02", 1, "A", 1), tx(3, "2026-10-01", 2, "B", 2), tx(4, "2026-10-02", 2, "B", 2)];
    expect(frequentEntries(rows, 1).map((e) => e.description)).toEqual(["B"]);
  });
});

describe("guessCategory", () => {
  const history: DescriptionUse[] = [
    { description: "Nasi Padang", categoryId: 1, n: 6 },
    { description: "Nasi goreng", categoryId: 1, n: 2 },
    { description: "Nasi kotak kantor", categoryId: 2, n: 3 },
    { description: "Bensin", categoryId: 3, n: 4 },
    { description: "Gaji", categoryId: 9, n: 3 },
  ];
  const expense = new Set([1, 2, 3]);

  it("uses an exact note first, ignoring case and spaces", () => {
    expect(guessCategory(history, "  bensin ", expense)).toBe(3);
    expect(guessCategory(history, "nasi kotak kantor", expense)).toBe(2);
    // An exact note wins even over a more used category whose notes only start with it.
    expect(guessCategory([...history, { description: "Nasi", categoryId: 2, n: 1 }], "nasi", expense)).toBe(2);
  });

  it("falls back to notes that start with the text, picking the most used category", () => {
    expect(guessCategory(history, "nasi", expense)).toBe(1); // 6 + 2 against 3
    expect(guessCategory(history, "nasi k", expense)).toBe(2);
  });

  it("needs 3 characters and only picks allowed categories", () => {
    expect(guessCategory(history, "na", expense)).toBeNull();
    expect(guessCategory(history, "gaji", expense)).toBeNull();
    expect(guessCategory(history, "gaji", new Set([9]))).toBe(9);
    expect(guessCategory(history, "kopi", expense)).toBeNull();
  });
});
