// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useNavigate } from "react-router-dom";
import { ProjectsView } from "../tree/ProjectsView";
import { NoteTasks } from "../notes/NoteTasks";
import { TaskNotes } from "../components/TaskNotes";
import { useData } from "../data/DataProvider";
import {
  LocationProbe,
  demoNote,
  demoProject,
  demoTask,
  renderAt,
  stubApi,
} from "./helpers";

afterEach(cleanup);

describe("привязка заметок к задачам", () => {
  it("deep-link /projects/1?task=N открывает инспектор задачи", async () => {
    stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()]);
    renderAt("/projects/1?task=10", "/projects/:pid?", <ProjectsView />);
    expect(await screen.findByDisplayValue("цель")).toBeDefined();
  });

  it("прикрепление заметки из инспектора: пикер → POST → строка в списке", async () => {
    const log = stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()], {
      notes: [demoNote({ id: 5, title: "Личное" })],
    });
    renderAt("/projects/1?task=10", "/projects/:pid?", <ProjectsView />);
    fireEvent.click(await screen.findByText("＋ прикрепить"));
    fireEvent.change(screen.getByLabelText("Поиск заметки"), {
      target: { value: "Лич" },
    });
    fireEvent.click(await screen.findByText("Личное"));

    await waitFor(() => {
      const post = log.find(
        (l) => l.method === "POST" && l.path === "/api/task-notes",
      );
      expect(post).toBeDefined();
      expect(post!.body).toEqual({ taskId: 10, noteId: 5 });
    });
    // строка появилась в секции «Заметки»
    expect(await screen.findByTitle("Открепить заметку")).toBeDefined();
  });

  it("открепление: ✕ → попап → «Открепить» → DELETE, строка исчезает", async () => {
    const log = stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()], {
      notes: [demoNote({ id: 5, title: "Личное" })],
      taskNotes: [{ id: 1, logicalId: 10, noteId: 5 }],
    });
    renderAt("/projects/1?task=10", "/projects/:pid?", <ProjectsView />);
    fireEvent.click(await screen.findByTitle("Открепить заметку"));
    // сам клик по ✕ ничего не удаляет — открывает попап подтверждения
    expect(
      log.find((l) => l.method === "DELETE"),
    ).toBeUndefined();
    fireEvent.click(await screen.findByText("Открепить"));
    await waitFor(() => {
      expect(
        log.find(
          (l) => l.method === "DELETE" && l.path === "/api/task-notes/1",
        ),
      ).toBeDefined();
    });
    expect(screen.queryByTitle("Открепить заметку")).toBeNull();
  });

  it("чип задачи в заметке ведёт к задаче (?task в URL, focus в state)", async () => {
    stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()], {
      notes: [demoNote({ id: 5, title: "Личное" })],
      taskNotes: [{ id: 1, logicalId: 10, noteId: 5 }],
    });
    const probe: { path: string; search: string; state?: unknown } = {
      path: "",
      search: "",
    };
    renderAt(
      "/notes/5",
      "/notes/:id?",
      <NoteTasks noteId={5} />,
      <LocationProbe into={probe} />,
    );
    fireEvent.click(await screen.findByTitle("Перейти к задаче"));
    await waitFor(() => {
      expect(probe.path).toBe("/projects/1");
      // адрес чистый — focus не в URL, а разовым сигналом в navigation state
      expect(probe.search).toBe("?task=10");
      expect(probe.state).toEqual({ focus: 10 });
    });
  });

  it("прикрепление задачи из заметки: пикер → POST, чип появляется", async () => {
    const log = stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()], {
      notes: [demoNote({ id: 5, title: "Личное" })],
    });
    renderAt("/notes/5", "/notes/:id?", <NoteTasks noteId={5} />);
    fireEvent.click(await screen.findByText("＋ задача"));
    fireEvent.change(screen.getByLabelText("Поиск задачи"), {
      target: { value: "цел" },
    });
    fireEvent.click(await screen.findByText("цель"));
    await waitFor(() => {
      const post = log.find(
        (l) => l.method === "POST" && l.path === "/api/task-notes",
      );
      expect(post?.body).toEqual({ taskId: 10, noteId: 5 });
    });
    expect(await screen.findByTitle("Перейти к задаче")).toBeDefined();
  });
});

describe("привязка к логической задаче (серия повторов)", () => {
  // серия: прошлое done-вхождение id=10 и живое id=20, общий logicalId=10
  const series = () => [
    demoTask({ id: 10, title: "планёрка", logicalId: 10, done: true }),
    demoTask({ id: 20, title: "планёрка", logicalId: 10 }),
  ];

  it("заметка серии видна в инспекторе любого вхождения", async () => {
    stubApi(series(), [demoProject()], {
      notes: [demoNote({ id: 5, title: "Протокол" })],
      taskNotes: [{ id: 1, logicalId: 10, noteId: 5 }],
    });
    // открываем НОВОЕ вхождение (id=20) — привязка висит на logicalId=10
    renderAt("/projects/1?task=20", "/projects/:pid?", <ProjectsView />);
    expect(await screen.findByTitle("Открепить заметку")).toBeDefined();
    expect(screen.getByText("Протокол")).toBeDefined();
  });

  it("чип в заметке ведёт к последнему вхождению серии", async () => {
    stubApi(series(), [demoProject()], {
      notes: [demoNote({ id: 5, title: "Протокол" })],
      taskNotes: [{ id: 1, logicalId: 10, noteId: 5 }],
    });
    const probe: { path: string; search: string } = { path: "", search: "" };
    renderAt(
      "/notes/5",
      "/notes/:id?",
      <NoteTasks noteId={5} />,
      <LocationProbe into={probe} />,
    );
    fireEvent.click(await screen.findByTitle("Перейти к задаче"));
    await waitFor(() => {
      // представитель — последнее созданное вхождение (id=20), не прошлое
      expect(probe.search).toBe("?task=20");
    });
  });

  it("пикер схлопывает серию: одно совпадение — последнее вхождение", async () => {
    const log = stubApi(series(), [demoProject()], {
      notes: [demoNote({ id: 5, title: "Протокол" })],
    });
    renderAt("/notes/5", "/notes/:id?", <NoteTasks noteId={5} />);
    fireEvent.click(await screen.findByText("＋ задача"));
    fireEvent.change(screen.getByLabelText("Поиск задачи"), {
      target: { value: "планёрка" },
    });
    const options = await screen.findAllByText("планёрка");
    expect(options.length).toBe(1); // не два вхождения, а одна логическая
    fireEvent.click(options[0]);
    await waitFor(() => {
      const post = log.find(
        (l) => l.method === "POST" && l.path === "/api/task-notes",
      );
      // прикрепление шлёт id последнего вхождения — сервер резолвит логический
      expect(post?.body).toEqual({ taskId: 20, noteId: 5 });
    });
  });
});

// Хелперы: дёргают remove/removeNote из DataProvider, чтобы проверить
// локальную чистку привязок без перезагрузки (мёртвые строки/чипы).
function NoteSideHarness({ noteId }: { noteId: number }) {
  const { remove } = useData();
  return (
    <>
      <NoteTasks noteId={noteId} />
      <button type="button" onClick={() => void remove(10)}>
        del-task
      </button>
    </>
  );
}

function TaskSideHarness() {
  const { tasks, removeNote } = useData();
  const task = tasks.get(10);
  return task ? (
    <>
      <TaskNotes task={task} />
      <button type="button" onClick={() => void removeNote(5)}>
        del-note
      </button>
    </>
  ) : null;
}

describe("чистка привязок при удалении", () => {
  it("удаление задачи убирает её чип из заметки без перезагрузки", async () => {
    stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()], {
      notes: [demoNote({ id: 5, title: "Личное" })],
      taskNotes: [{ id: 1, logicalId: 10, noteId: 5 }],
    });
    renderAt("/notes/5", "/notes/:id?", <NoteSideHarness noteId={5} />);
    expect(await screen.findByTitle("Перейти к задаче")).toBeDefined();
    fireEvent.click(screen.getByText("del-task"));
    await waitFor(() => {
      expect(screen.queryByTitle("Перейти к задаче")).toBeNull();
    });
  });

  it("удаление заметки убирает её строку из инспектора без перезагрузки", async () => {
    stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()], {
      notes: [demoNote({ id: 5, title: "Личное" })],
      taskNotes: [{ id: 1, logicalId: 10, noteId: 5 }],
    });
    renderAt("/projects/1", "/projects/:pid?", <TaskSideHarness />);
    expect(await screen.findByTitle("Открепить заметку")).toBeDefined();
    fireEvent.click(screen.getByText("del-note"));
    await waitFor(() => {
      expect(screen.queryByTitle("Открепить заметку")).toBeNull();
    });
  });
});

// Обёртка: навигация к задаче как из ссылки/палитры — ?task в URL, focus
// разовым сигналом в navigation state (данные к этому моменту загружены).
function FocusNavHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          navigate("/projects/1?task=10", { state: { focus: 10 } })
        }
      >
        go
      </button>
      <ProjectsView />
    </>
  );
}

describe("подсветка задачи в дереве (navigation state)", () => {
  it("переход флешит задачу и снимает подсветку; адрес чистый (?task)", async () => {
    stubApi([demoTask({ id: 10, title: "цель" })], [demoProject()]);
    const probe: { path: string; search: string; state?: unknown } = {
      path: "",
      search: "",
    };
    renderAt(
      "/projects/1",
      "/projects/:pid?",
      <FocusNavHarness />,
      <LocationProbe into={probe} />,
    );
    // дерево загрузилось
    await screen.findByText("цель");
    const row = () => screen.getByText("цель").closest(".tree-row");
    expect(row()?.classList.contains("bg-asoft")).toBe(false);

    fireEvent.click(screen.getByText("go"));
    // адрес чистый (focus не в URL), задача подсвечена
    await waitFor(() => {
      expect(probe.search).toBe("?task=10");
      expect(probe.state).toEqual({ focus: 10 });
      expect(row()?.classList.contains("bg-asoft")).toBe(true);
    });
    // подсветка снимается по таймеру (~2.2с)
    await waitFor(
      () => expect(row()?.classList.contains("bg-asoft")).toBe(false),
      { timeout: 2600 },
    );
  });
});
