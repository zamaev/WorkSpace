import { describe, expect, it } from "vitest";
import { ganttTaskRows, hasDate } from "./rows";
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

// дерево: 1 (без дат) -> 2 (без дат) -> 3 (с датой); 4 (с датой), 5 (без дат)
const t1 = task({ id: 1, parentId: null });
const t2 = task({ id: 2, parentId: 1 });
const t3 = task({ id: 3, parentId: 2, scheduledOn: "2030-01-07" });
const t4 = task({ id: 4, parentId: null, dueOn: "2030-01-10" });
const t5 = task({ id: 5, parentId: null });
const all = [t1, t2, t3, t4, t5];
const kids = (id: number) => all.filter((t) => t.parentId === id);
const roots = all.filter((t) => t.parentId === null);
const none = () => false;
const yes = () => true;

describe("hasDate", () => {
  it("любая из четырёх дат делает задачу датированной", () => {
    expect(hasDate(task({ scheduledOn: "2030-01-01" }))).toBe(true);
    expect(hasDate(task({ endOn: "2030-01-01" }))).toBe(true);
    expect(hasDate(task({ softDueOn: "2030-01-01" }))).toBe(true);
    expect(hasDate(task({ dueOn: "2030-01-01" }))).toBe(true);
    expect(hasDate(task({}))).toBe(false);
  });
});

describe("ganttTaskRows", () => {
  it("без скрытия — весь развёрнутый лес по порядку и глубине", () => {
    const rows = ganttTaskRows(roots, kids, {
      collapsed: none,
      hideUndated: false,
      filter: yes,
    });
    expect(rows.map((r) => [r.task.id, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 0],
      [5, 0],
    ]);
  });

  it("hideUndated: недатированные предки датированной задачи остаются", () => {
    const rows = ganttTaskRows(roots, kids, {
      collapsed: none,
      hideUndated: true,
      filter: yes,
    });
    // 1 и 2 без дат, но у 3 дата — весь путь виден; 4 с датой; 5 скрыт
    expect(rows.map((r) => r.task.id)).toEqual([1, 2, 3, 4]);
  });

  it("hideUndated: шеврон только если есть видимые потомки", () => {
    const rows = ganttTaskRows(roots, kids, {
      collapsed: none,
      hideUndated: true,
      filter: yes,
    });
    const byId = new Map(rows.map((r) => [r.task.id, r.hasChildren]));
    expect(byId.get(1)).toBe(true); // ведёт к датированной 3
    expect(byId.get(3)).toBe(false); // лист
    expect(byId.get(4)).toBe(false); // детей нет
  });

  it("collapsed прячет поддерево, но шеврон остаётся", () => {
    const rows = ganttTaskRows(roots, kids, {
      collapsed: (id) => id === 1,
      hideUndated: false,
      filter: yes,
    });
    expect(rows.map((r) => r.task.id)).toEqual([1, 4, 5]);
    expect(rows.find((r) => r.task.id === 1)!.hasChildren).toBe(true);
  });

  it("filter скрывает строку, но потомки показываются независимо", () => {
    const rows = ganttTaskRows(roots, kids, {
      collapsed: none,
      hideUndated: false,
      filter: (t) => t.id !== 2,
    });
    // 2 скрыта, но её ребёнок 3 остаётся (на своей глубине)
    expect(rows.map((r) => [r.task.id, r.depth])).toEqual([
      [1, 0],
      [3, 2],
      [4, 0],
      [5, 0],
    ]);
  });
});
