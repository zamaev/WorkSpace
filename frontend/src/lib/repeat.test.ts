import { describe, expect, it } from "vitest";
import { fmtRepeatDays, ghostOccurrences, isoDow } from "./repeat";
import type { Task } from "../data/types";

function task(p: Partial<Task>): Task {
  return {
    id: 1,
    parentId: null,
    projectId: 1,
    title: "t",
    description: "",
    done: false,
    scheduledOn: null,
    endOn: null,
    softDueOn: null,
    dueOn: null,
    typeId: null,
    assigneeId: null,
    position: 0,
    dayPosition: null,
    repeat: null,
    ...p,
  };
}

describe("repeat", () => {
  it("isoDow: пн=1, вс=7", () => {
    expect(isoDow("2030-01-07")).toBe(1);
    expect(isoDow("2030-01-06")).toBe(7);
  });
  it("подпись дней", () => {
    expect(fmtRepeatDays({ kind: "weekly", days: [1, 4] })).toBe("пн · чт");
  });
  it("призраки: строго после плановой даты, в границах окна", () => {
    const t = task({
      scheduledOn: "2030-01-07",
      repeat: { kind: "weekly", days: [1, 4] },
    });
    expect(ghostOccurrences(t, "2030-01-07", "2030-01-20")).toEqual([
      "2030-01-10",
      "2030-01-14",
      "2030-01-17",
    ]);
  });
  it("призраки: сама плановая дата не дублируется, окно до неё — пусто", () => {
    const t = task({
      scheduledOn: "2030-01-07",
      repeat: { kind: "weekly", days: [1] },
    });
    expect(ghostOccurrences(t, "2030-01-01", "2030-01-07")).toEqual([]);
  });
  it("done и без правила — призраков нет", () => {
    expect(
      ghostOccurrences(
        task({
          scheduledOn: "2030-01-07",
          done: true,
          repeat: { kind: "weekly", days: [1] },
        }),
        "2030-01-01",
        "2030-02-01",
      ),
    ).toEqual([]);
    expect(
      ghostOccurrences(
        task({ scheduledOn: "2030-01-07" }),
        "2030-01-01",
        "2030-02-01",
      ),
    ).toEqual([]);
  });
});
