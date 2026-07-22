import { describe, expect, it } from "vitest";
import { paletteMatches } from "./palette";
import type { Project, Task } from "../data/types";

function proj(id: number, name: string, archived = false): Project {
  return {
    id,
    parentId: null,
    name,
    color: "#c9a96a",
    startOn: null,
    dueOn: null,
    archived,
    position: id,
  };
}
function task(
  id: number,
  title: string,
  projectId: number,
  done = false,
): Task {
  return {
    id,
    parentId: null,
    projectId,
    title,
    description: "",
    done,
    scheduledOn: null,
    endOn: null,
    softDueOn: null,
    dueOn: null,
    typeId: null,
    assigneeId: null,
    position: id,
    dayPosition: null,
    repeat: null,
  };
}

const projects = new Map([
  [1, proj(1, "Релиз")],
  [2, proj(2, "Архивный", true)],
]);
const tasks = new Map([
  [10, task(10, "Проверить релиз-ноты", 1)],
  [11, task(11, "Старая задача", 2)],
  [12, task(12, "релизный чеклист", 1, true)],
]);

describe("paletteMatches", () => {
  it("пустой запрос — пусто", () => {
    expect(paletteMatches(tasks, projects, "  ")).toEqual([]);
  });
  it("без регистра, проекты раньше задач, prefix раньше substring", () => {
    const got = paletteMatches(tasks, projects, "рели");
    expect(got.map((i) => `${i.kind}:${i.label}`)).toEqual([
      "project:Релиз",
      "task:релизный чеклист",
      "task:Проверить релиз-ноты",
    ]);
  });
  it("архивные проекты и их задачи не ищутся", () => {
    expect(paletteMatches(tasks, projects, "архив")).toEqual([]);
    expect(paletteMatches(tasks, projects, "старая")).toEqual([]);
  });
  it("у задачи — имя проекта и done", () => {
    const [item] = paletteMatches(tasks, projects, "чеклист");
    expect(item).toMatchObject({
      kind: "task",
      projectName: "Релиз",
      done: true,
      projectId: 1,
    });
  });
  it("лимит соблюдается", () => {
    const many = new Map(
      [...Array(30)].map((_, i) => [100 + i, task(100 + i, `навал ${i}`, 1)]),
    );
    expect(paletteMatches(many, projects, "навал", 20)).toHaveLength(20);
  });
});
