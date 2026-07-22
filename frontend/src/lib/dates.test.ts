import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  fmtDayChip,
  fmtDayHeader,
  fmtMonthTitle,
  fmtWeekRange,
  mondayOf,
  monthCells,
  weekDays,
} from "./dates";

describe("mondayOf", () => {
  it("будни и воскресенье схлопываются в один понедельник", () => {
    expect(mondayOf("2026-07-21")).toBe("2026-07-20"); // вторник
    expect(mondayOf("2026-07-20")).toBe("2026-07-20"); // понедельник
    expect(mondayOf("2026-07-26")).toBe("2026-07-20"); // воскресенье
  });
  it("через границу месяца", () => {
    expect(mondayOf("2026-08-01")).toBe("2026-07-27"); // суббота
  });
});

describe("addDays", () => {
  it("вперёд и назад, через границы", () => {
    expect(addDays("2026-07-21", 1)).toBe("2026-07-22");
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("weekDays", () => {
  it("семь дней от понедельника", () => {
    const days = weekDays("2026-07-20");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-07-20");
    expect(days[6]).toBe("2026-07-26");
  });
});

describe("форматирование", () => {
  it("чип дня — «Вт 22»", () => {
    expect(fmtDayChip("2026-07-22")).toBe("Ср 22");
    expect(fmtDayChip("2026-07-21")).toBe("Вт 21");
  });
  it("заголовок дня — «Пн 20»", () => {
    expect(fmtDayHeader("2026-07-20")).toBe("Пн 20");
  });
  it("диапазон недели внутри месяца и через границу", () => {
    expect(fmtWeekRange("2026-07-20")).toBe("20–26 июля");
    expect(fmtWeekRange("2026-07-27")).toBe("27 июля – 2 августа");
  });
});

describe("календарь", () => {
  it("monthCells — 42 ячейки от понедельника, флаг месяца", () => {
    const cells = monthCells("2026-07-15");
    expect(cells).toHaveLength(42);
    expect(cells[0].iso).toBe("2026-06-29"); // 1 июля 2026 — среда
    expect(cells[0].inMonth).toBe(false);
    expect(cells[2].iso).toBe("2026-07-01");
    expect(cells[2].inMonth).toBe(true);
  });
  it("addMonths через границу года", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });
  it("fmtMonthTitle", () => {
    expect(fmtMonthTitle("2026-07-01")).toBe("Июль 2026");
  });
});
