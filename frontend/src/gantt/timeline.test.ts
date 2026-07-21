import { describe, expect, it } from "vitest";
import { buildScale, dayAt, dayDiff, dayIndex, monthSegments, saturdayOffset } from "./timeline";

describe("dayDiff", () => {
  it("считает через границы месяцев и лет", () => {
    expect(dayDiff("2026-07-20", "2026-07-27")).toBe(7);
    expect(dayDiff("2026-07-31", "2026-08-01")).toBe(1);
    expect(dayDiff("2026-01-01", "2025-12-31")).toBe(-1);
  });
});

describe("buildScale", () => {
  it("без дат — окно вокруг сегодня", () => {
    const s = buildScale([], "2026-07-21");
    expect(s.start).toBe("2026-07-14"); // -7
    expect(dayAt(s, s.days - 1)).toBe("2026-08-25"); // +35
  });
  it("растягивается под даты с запасом", () => {
    const s = buildScale(["2026-06-01", "2026-10-01"], "2026-07-21");
    expect(s.start).toBe("2026-05-25");
    expect(dayAt(s, s.days - 1)).toBe("2026-10-22");
  });
  it("dayIndex обратен dayAt", () => {
    const s = buildScale(["2026-06-01"], "2026-07-21");
    expect(dayIndex(s, dayAt(s, 10))).toBe(10);
  });
});

describe("monthSegments", () => {
  it("сегменты покрывают всю шкалу и режутся по месяцам", () => {
    const s = buildScale([], "2026-07-21"); // 14 июля – 25 августа
    const segs = monthSegments(s);
    expect(segs.map((x) => x.label)).toEqual(["Июль 2026", "Август 2026"]);
    expect(segs.reduce((acc, x) => acc + x.days, 0)).toBe(s.days);
    expect(segs[0].days).toBe(18); // 14–31 июля
  });
});

describe("saturdayOffset", () => {
  it("считает смещение первой субботы", () => {
    // 2026-07-14 — вторник (dow=2) → суббота через 4 дня
    expect(saturdayOffset(buildScale([], "2026-07-21"))).toBe(4);
  });
});
