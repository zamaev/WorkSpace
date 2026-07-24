// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { WeekView } from "../week/WeekView";
import { todayISO, addDays, mondayOf } from "../lib/dates";
import { demoProject, demoTask, renderAt, stubApi } from "./helpers";

afterEach(cleanup);

const monday = mondayOf(todayISO());

describe("многодневная задача в неделе", () => {
  it("продолжения зачёркнуты, когда задача сделана (регресс)", async () => {
    // план пн→ср: живая карточка в пн + продолжения во вт и ср
    const t = demoTask({
      id: 60,
      title: "вёрстка",
      scheduledOn: monday,
      endOn: addDays(monday, 2),
      done: true,
    });
    stubApi([t], [demoProject()]);
    renderAt("/week", "/week/:date?", <WeekView />);

    // задача мелькает и в секции «Просрочено» (не .task-card) — берём карточки
    await screen.findAllByText("вёрстка");
    const cards = screen
      .queryAllByText("вёрстка")
      .map((el) => el.closest(".task-card"))
      .filter((c): c is HTMLElement => c !== null);
    // продолжения помечены пунктиром (card-echo) — их должно быть больше нуля
    const spans = cards.filter((c) => c.classList.contains("card-echo"));
    expect(spans.length).toBeGreaterThan(0);
    // и живая, и все продолжения — зачёркнуты (task-card-done)
    for (const c of cards) {
      expect(c.classList.contains("task-card-done")).toBe(true);
    }
  });

  it("не сделанная многодневная: продолжения пунктирные, но не зачёркнуты", async () => {
    const t = demoTask({
      id: 61,
      title: "макет",
      scheduledOn: monday,
      endOn: addDays(monday, 2),
      done: false,
    });
    stubApi([t], [demoProject()]);
    renderAt("/week", "/week/:date?", <WeekView />);

    await screen.findAllByText("макет");
    const cards = screen
      .queryAllByText("макет")
      .map((el) => el.closest(".task-card"))
      .filter((c): c is HTMLElement => c !== null);
    const spans = cards.filter((c) => c.classList.contains("card-echo"));
    expect(spans.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.classList.contains("task-card-done")).toBe(false);
    }
  });
});
