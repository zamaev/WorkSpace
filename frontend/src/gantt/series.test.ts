import { describe, expect, it } from "vitest";
import { collapseSeries } from "./series";
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
    seriesId: null,
    ...p,
  };
}

describe("collapseSeries", () => {
  it("серия схлопывается в живого носителя, прошлые — точками", () => {
    const d1 = task({
      id: 1,
      title: "синк",
      done: true,
      scheduledOn: "2030-01-07",
      seriesId: 1,
    });
    const d2 = task({
      id: 2,
      title: "синк",
      done: true,
      scheduledOn: "2030-01-10",
      seriesId: 1,
    });
    const live = task({
      id: 3,
      title: "синк",
      scheduledOn: "2030-01-14",
      seriesId: 1,
      repeat: { kind: "weekly", days: [1, 4] },
    });
    const other = task({ id: 9, title: "обычная" });
    const { rows, hiddenSubtreeRoots } = collapseSeries([
      { task: d1, depth: 0 },
      { task: d2, depth: 0 },
      { task: live, depth: 0 },
      { task: other, depth: 0 },
    ]);
    expect(rows.map((r) => r.task.id)).toEqual([3, 9]);
    expect(rows[0].pastOccurrences).toEqual([
      { date: "2030-01-07", done: true },
      { date: "2030-01-10", done: true },
    ]);
    expect([...hiddenSubtreeRoots].sort()).toEqual([1, 2]);
  });
  it("без живого — носитель последний по дате", () => {
    const d1 = task({
      id: 1,
      done: true,
      scheduledOn: "2030-01-07",
      seriesId: 1,
    });
    const d2 = task({
      id: 2,
      done: true,
      scheduledOn: "2030-01-10",
      seriesId: 1,
    });
    const { rows } = collapseSeries([
      { task: d1, depth: 0 },
      { task: d2, depth: 0 },
    ]);
    expect(rows.map((r) => r.task.id)).toEqual([2]);
  });
  it("задачи без серии не трогаются", () => {
    const a = task({ id: 1 });
    const { rows, hiddenSubtreeRoots } = collapseSeries([
      { task: a, depth: 0 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].pastOccurrences).toEqual([]);
    expect(hiddenSubtreeRoots.size).toBe(0);
  });
});
