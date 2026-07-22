import { describe, expect, it } from "vitest";
import { normalizeFilter } from "./TaskFilters";

describe("normalizeFilter", () => {
  it("живой id проходит", () => {
    expect(normalizeFilter("7", [3, 7])).toBe("7");
  });
  it("удалённый id, мусор и легаси «me» — «все»", () => {
    expect(normalizeFilter("9", [3, 7])).toBe("all");
    expect(normalizeFilter("abc", [3, 7])).toBe("all");
    expect(normalizeFilter("me", [3, 7])).toBe("all");
    expect(normalizeFilter(null, [3, 7])).toBe("all");
  });
});
