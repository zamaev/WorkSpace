import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import {
  breadcrumb,
  childStats,
  childrenOf,
  overdue,
  overdueDeadline,
  rootTasks,
  spanTasksOn,
  subtreeIds,
  tasksOn,
} from "./selectors";

let nextId = 1;
function task(p: Partial<Task>): Task {
  return {
    id: nextId++,
    parentId: null,
    projectId: 1,
    title: `t${nextId}`,
    description: "",
    done: false,
    scheduledOn: null,
    endOn: null,
    softDueOn: null,
    repeat: null,
    seriesId: null,
    dueOn: null,
    typeId: null,
    assigneeId: null,
    position: 0,
    dayPosition: null,
    ...p,
  };
}

function toMap(tasks: Task[]): Map<number, Task> {
  return new Map(tasks.map((t) => [t.id, t]));
}

describe("дерево", () => {
  const a = task({ title: "a", position: 1 });
  const b = task({ title: "b", position: 0 });
  const a1 = task({ title: "a1", parentId: a.id, position: 1, done: true });
  const a2 = task({ title: "a2", parentId: a.id, position: 0 });
  const a11 = task({ title: "a11", parentId: a1.id });
  const all = toMap([a, b, a1, a2, a11]);

  it("rootTasks сортирует по position и фильтрует по проекту", () => {
    expect(rootTasks(all, 1).map((t) => t.title)).toEqual(["b", "a"]);
    expect(rootTasks(all, 2)).toEqual([]);
  });
  it("childrenOf сортирует по position", () => {
    expect(childrenOf(all, a.id).map((t) => t.title)).toEqual(["a2", "a1"]);
  });
  it("breadcrumb — путь родителей сверху вниз", () => {
    expect(breadcrumb(all, a11.id)).toBe("a / a1");
    expect(breadcrumb(all, a.id)).toBe("");
  });
  it("subtreeIds — узел и все потомки", () => {
    expect(new Set(subtreeIds(all, a.id))).toEqual(
      new Set([a.id, a1.id, a2.id, a11.id]),
    );
  });
  it("childStats — только прямые дети", () => {
    expect(childStats(all, a.id)).toEqual({ done: 1, total: 2 });
    expect(childStats(all, b.id)).toEqual({ done: 0, total: 0 });
  });
});

describe("дни", () => {
  const m = task({ title: "m", scheduledOn: "2026-07-20", dayPosition: 1 });
  const n = task({ title: "n", scheduledOn: "2026-07-20", dayPosition: 0 });
  const late = task({ title: "late", scheduledOn: "2026-07-10" });
  const lateDone = task({
    title: "lateDone",
    scheduledOn: "2026-07-10",
    done: true,
  });
  const today = task({ title: "today", scheduledOn: "2026-07-21" });
  const all = toMap([m, n, late, lateDone, today]);

  it("tasksOn сортирует по dayPosition", () => {
    expect(tasksOn(all, "2026-07-20").map((t) => t.title)).toEqual(["n", "m"]);
  });
  it("overdue — только несделанные строго до сегодня", () => {
    // «сегодня» = 20-е: late (10-е) просрочена, m/n на сегодня — нет,
    // lateDone сделана, today (21-е) в будущем
    expect(overdue(all, "2026-07-20").map((t) => t.title)).toEqual(["late"]);
  });
  it("overdue — диапазон просрочен по концу работы, не по началу", () => {
    const running = task({
      title: "running",
      scheduledOn: "2026-07-18",
      endOn: "2026-07-21",
    });
    const finished = task({
      title: "finished",
      scheduledOn: "2026-07-15",
      endOn: "2026-07-17",
    });
    const m = toMap([running, finished]);
    expect(overdue(m, "2026-07-20").map((t) => t.title)).toEqual(["finished"]);
  });
});

describe("многодневные", () => {
  const span = task({
    title: "span",
    scheduledOn: "2026-07-21",
    endOn: "2026-07-24",
  });
  const single = task({ title: "single", scheduledOn: "2026-07-22" });
  const all = toMap([span, single]);

  it("spanTasksOn — дни диапазона после первого", () => {
    expect(spanTasksOn(all, "2026-07-21").map((t) => t.title)).toEqual([]);
    expect(spanTasksOn(all, "2026-07-22").map((t) => t.title)).toEqual([
      "span",
    ]);
    expect(spanTasksOn(all, "2026-07-24").map((t) => t.title)).toEqual([
      "span",
    ]);
    expect(spanTasksOn(all, "2026-07-25").map((t) => t.title)).toEqual([]);
  });
  it("tasksOn показывает многодневную только в первый день", () => {
    expect(tasksOn(all, "2026-07-21").map((t) => t.title)).toEqual(["span"]);
    expect(tasksOn(all, "2026-07-22").map((t) => t.title)).toEqual(["single"]);
  });
});

describe("дедлайны", () => {
  const dueLate = task({ title: "dueLate", dueOn: "2026-07-15" });
  const dueLateDone = task({
    title: "dueLateDone",
    dueOn: "2026-07-15",
    done: true,
  });
  const dueSoon = task({ title: "dueSoon", dueOn: "2026-07-30" });
  const both = task({
    title: "both",
    scheduledOn: "2026-07-10",
    dueOn: "2026-07-12",
  });
  const planOnly = task({ title: "planOnly", scheduledOn: "2026-07-10" });
  const all = toMap([dueLate, dueLateDone, dueSoon, both, planOnly]);

  it("overdueDeadline — несделанные с dueOn < сегодня, по дате", () => {
    expect(overdueDeadline(all, "2026-07-20").map((t) => t.title)).toEqual([
      "both",
      "dueLate",
    ]);
  });
  it("overdue не дублирует задачи с сорванным дедлайном", () => {
    expect(overdue(all, "2026-07-20").map((t) => t.title)).toEqual([
      "planOnly",
    ]);
  });
});
