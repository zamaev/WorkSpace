import { describe, expect, it } from "vitest";
import { duePhase } from "./due";

const D = "2026-07-22";

describe("duePhase", () => {
  it("без дат — null", () => {
    expect(duePhase(null, null, D)).toBeNull();
  });
  it("оба: до мягкого — soft с мягкой датой", () => {
    expect(duePhase("2026-07-24", "2026-07-26", D)).toEqual({
      phase: "soft",
      date: "2026-07-24",
    });
  });
  it("оба: мягкий позади — warn с жёсткой датой", () => {
    expect(duePhase("2026-07-20", "2026-07-26", D)).toEqual({
      phase: "warn",
      date: "2026-07-26",
    });
  });
  it("оба: жёсткий позади — over", () => {
    expect(duePhase("2026-07-18", "2026-07-20", D)).toEqual({
      phase: "over",
      date: "2026-07-20",
    });
  });
  it("день мягкого дедлайна — уже warn", () => {
    expect(duePhase(D, "2026-07-26", D)).toEqual({
      phase: "warn",
      date: "2026-07-26",
    });
  });
  it("только жёсткий: до — soft, после — over (warn нет)", () => {
    expect(duePhase(null, "2026-07-26", D)).toEqual({
      phase: "soft",
      date: "2026-07-26",
    });
    expect(duePhase(null, "2026-07-20", D)).toEqual({
      phase: "over",
      date: "2026-07-20",
    });
  });
  it("только мягкий: до — soft, после — warn (over не бывает)", () => {
    expect(duePhase("2026-07-26", null, D)).toEqual({
      phase: "soft",
      date: "2026-07-26",
    });
    expect(duePhase("2026-07-20", null, D)).toEqual({
      phase: "warn",
      date: "2026-07-20",
    });
  });
});
