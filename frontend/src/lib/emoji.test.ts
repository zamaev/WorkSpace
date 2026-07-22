import { describe, expect, it } from "vitest";
import { lastGrapheme } from "./emoji";

describe("lastGrapheme", () => {
  it("оставляет последний введённый смайл", () => {
    expect(lastGrapheme("💻🧪")).toBe("🧪");
    expect(lastGrapheme("💻")).toBe("💻");
  });
  it("не режет составные эмодзи", () => {
    expect(lastGrapheme("👨‍💻")).toBe("👨‍💻");
    expect(lastGrapheme("💻👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });
  it("пустая строка — пусто", () => {
    expect(lastGrapheme("  ")).toBe("");
  });
});
