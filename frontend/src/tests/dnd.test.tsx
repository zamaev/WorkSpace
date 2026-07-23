// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ProjectsView } from "../tree/ProjectsView";
import { WeekView } from "../week/WeekView";
import { todayISO, addDays, mondayOf } from "../lib/dates";
import {
  DT,
  demoProject,
  demoTask,
  renderAt,
  stubApi,
  type FetchLogEntry,
} from "./helpers";

// waitFor ретраит только бросающие колбэки — find сам по себе не ждёт
async function waitPatch(log: FetchLogEntry[], path: string) {
  return waitFor(() => {
    const p = log.find((l) => l.method === "PATCH" && l.path === path);
    expect(p).toBeDefined();
    return p!;
  });
}

afterEach(cleanup);

const monday = mondayOf(todayISO());

describe("полоска-неделя в Проектах", () => {
  it("drop на ячейку назначает дату и прячет полоску (регресс v13)", async () => {
    const t = demoTask({ id: 10, title: "перенеси меня" });
    const log = stubApi([t], [demoProject()]);
    renderAt("/projects/1", "/projects/:pid?", <ProjectsView />);
    const row = (await screen.findByText("перенеси меня")).closest(
      ".tree-row",
    )!;

    const dt = new DT();
    fireEvent.dragStart(row, { dataTransfer: dt });
    const cells = await waitFor(() => {
      const c = document.querySelectorAll(".dragweek-cell");
      expect(c.length).toBeGreaterThan(0);
      return c;
    });

    fireEvent.drop(cells[2], { dataTransfer: dt });
    const patch = await waitPatch(log, "/api/tasks/10");
    expect((patch.body as { scheduledOn: string }).scheduledOn).toBe(
      addDays(monday, 2),
    );
    expect(document.querySelector(".dragweek")).toBeNull();
  });

  it("drop диапазона переносит его целиком с сохранением длины", async () => {
    const t = demoTask({
      id: 11,
      title: "спан",
      scheduledOn: addDays(monday, -7),
      endOn: addDays(monday, -5),
    });
    const log = stubApi([t], [demoProject()]);
    renderAt("/projects/1", "/projects/:pid?", <ProjectsView />);
    const row = (await screen.findByText("спан")).closest(".tree-row")!;

    const dt = new DT();
    fireEvent.dragStart(row, { dataTransfer: dt });
    await waitFor(() =>
      expect(
        document.querySelectorAll(".dragweek-cell").length,
      ).toBeGreaterThan(0),
    );
    fireEvent.drop(document.querySelectorAll(".dragweek-cell")[0], {
      dataTransfer: dt,
    });

    const patch = await waitPatch(log, "/api/tasks/11");
    expect(patch.body).toMatchObject({
      scheduledOn: monday,
      endOn: addDays(monday, 2),
    });
  });

  it("полоска исчезает после переноса в подзадачу (регресс v12)", async () => {
    const a = demoTask({ id: 20, title: "первая", position: 0 });
    const b = demoTask({ id: 21, title: "вторая", position: 1 });
    stubApi([a, b], [demoProject()]);
    renderAt("/projects/1", "/projects/:pid?", <ProjectsView />);
    const rowA = (await screen.findByText("первая")).closest(".tree-row")!;
    const rowB = (await screen.findByText("вторая")).closest(".tree-row")!;

    const dt = new DT();
    fireEvent.dragStart(rowA, { dataTransfer: dt });
    await waitFor(() =>
      expect(document.querySelector(".dragweek")).not.toBeNull(),
    );
    // в jsdom все rect'ы нулевые — computeZone даёт «внутрь», это и нужно
    fireEvent.drop(rowB, { dataTransfer: dt });
    await waitFor(() => expect(document.querySelector(".dragweek")).toBeNull());
  });

  it("drop на строку делает подзадачей (reparent)", async () => {
    const a = demoTask({ id: 30, title: "ребёнок", position: 0 });
    const b = demoTask({ id: 31, title: "родитель", position: 1 });
    const log = stubApi([a, b], [demoProject()]);
    renderAt("/projects/1", "/projects/:pid?", <ProjectsView />);
    const rowA = (await screen.findByText("ребёнок")).closest(".tree-row")!;
    const rowB = (await screen.findByText("родитель")).closest(".tree-row")!;

    const dt = new DT();
    fireEvent.dragStart(rowA, { dataTransfer: dt });
    fireEvent.drop(rowB, { dataTransfer: dt });
    const patch = await waitPatch(log, "/api/tasks/30");
    expect(patch.body).toMatchObject({ parentId: 31 });
  });
});

describe("неделя", () => {
  it("клик по телу карточки открывает модал, по чекбоксу — нет", async () => {
    const t = demoTask({
      id: 40,
      title: "кликни меня",
      scheduledOn: todayISO(),
    });
    stubApi([t], [demoProject()]);
    renderAt("/week", "/week/:date?", <WeekView />);
    const card = (await screen.findByText("кликни меня")).closest(
      ".task-card",
    )!;

    fireEvent.click(card.querySelector(".check")!);
    expect(document.querySelector(".sheet")).toBeNull();

    fireEvent.click(card);
    await waitFor(() =>
      expect(document.querySelector(".sheet")).not.toBeNull(),
    );
  });

  it("перенос повторяющейся уходит сразу, без диалога и repeatScope", async () => {
    const t = demoTask({
      id: 50,
      title: "планёрка",
      scheduledOn: todayISO(),
      repeat: { kind: "weekly", days: [1, 4] },
    });
    const log = stubApi([t], [demoProject()]);
    renderAt("/week", "/week/:date?", <WeekView />);
    // повторяющаяся видна и карточкой, и призраком — берём настоящую
    const card = (await screen.findAllByText("планёрка"))
      .map((el) => el.closest(".task-card")!)
      .find((c) => !c.classList.contains("card-echo"))!;

    const dt = new DT();
    fireEvent.dragStart(card, { dataTransfer: dt });
    const cols = document.querySelectorAll(".day-col");
    fireEvent.drop(cols[cols.length - 1], { dataTransfer: dt });

    const patch = await waitPatch(log, "/api/tasks/50");
    expect(screen.queryByRole("dialog", { name: /Перенос/ })).toBeNull();
    const body = patch.body as Record<string, unknown>;
    expect(body.repeatScope).toBeUndefined();
    expect(typeof body.scheduledOn).toBe("string");
  });

  it("призрак будущего вхождения виден в своей колонке", async () => {
    // повтор в каждый день недели: призраки во всех днях после плановой даты
    const t = demoTask({
      id: 70,
      title: "ежедневный синк",
      scheduledOn: todayISO(),
      repeat: { kind: "weekly", days: [1, 2, 3, 4, 5, 6, 7] },
    });
    stubApi([t], [demoProject()]);
    renderAt("/week", "/week/:date?", <WeekView />);
    await screen.findAllByText("ежедневный синк");
    await waitFor(() =>
      expect(document.querySelectorAll(".card-echo").length).toBeGreaterThan(
        0,
      ),
    );
  });

  it("продолжение многодневной не тащится, стартовая — да", async () => {
    const t = demoTask({
      id: 80,
      title: "релиз-марафон",
      scheduledOn: monday,
      endOn: addDays(monday, 2),
    });
    stubApi([t], [demoProject()]);
    renderAt("/week", "/week/:date?", <WeekView />);
    // задача может попасть и в панель «просрочено» (не .task-card) — берём
    // только карточки дневной сетки
    const cards = (await screen.findAllByText("релиз-марафон"))
      .map((el) => el.closest(".task-card"))
      .filter((c): c is HTMLElement => c !== null);
    const live = cards.filter((c) => !c.classList.contains("card-echo"));
    const spans = cards.filter((c) => c.classList.contains("card-echo"));
    // одна стартовая карточка (первый день) + продолжения в следующие дни
    expect(live).toHaveLength(1);
    expect(spans.length).toBeGreaterThan(0);
    // стартовую можно тащить, продолжения — нет
    expect(live[0].getAttribute("draggable")).toBe("true");
    for (const s of spans) expect(s.getAttribute("draggable")).toBe("false");
  });
});
