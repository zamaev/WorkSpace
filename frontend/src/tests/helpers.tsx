import { type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { DataProvider } from "../data/DataProvider";
import type { Project, Task } from "../data/types";

// jsdom не умеет scrollIntoView
Element.prototype.scrollIntoView = () => {};

// Стаб DataTransfer: jsdom не реализует drag-n-drop, а нашим dnd-хелперам
// хватает setData/getData/types.
export class DT {
  data: Record<string, string> = {};
  types: string[] = [];
  effectAllowed = "";
  dropEffect = "";
  setData(t: string, v: string) {
    this.data[t] = v;
    if (!this.types.includes(t)) this.types.push(t);
  }
  getData(t: string) {
    return this.data[t] ?? "";
  }
  setDragImage() {}
}

let nextId = 100;

export function demoProject(p: Partial<Project> = {}): Project {
  return {
    id: 1,
    parentId: null,
    name: "Демо",
    color: "#c9a96a",
    startOn: null,
    dueOn: null,
    archived: false,
    position: 0,
    ...p,
  };
}

export function demoTask(p: Partial<Task> = {}): Task {
  return {
    id: nextId++,
    parentId: null,
    projectId: 1,
    title: `задача ${nextId}`,
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

export type FetchLogEntry = { method: string; path: string; body: unknown };

// In-memory API: отдаёт переданные данные, пишет мутации в лог.
// PATCH задач отвечает текущей версией с применёнными полями — этого
// достаточно, чтобы DataProvider смёржил ответ без ошибок.
export function stubApi(tasks: Task[], projects: Project[]) {
  const log: FetchLogEntry[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    log.push({ method, path, body });
    const json = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => data,
    });
    if (method === "GET") {
      if (path === "/api/tasks") return json({ tasks: [...byId.values()] });
      if (path === "/api/projects") return json({ projects });
      if (path === "/api/types") return json({ types: [] });
      if (path === "/api/people") return json({ people: [] });
      if (path === "/api/roles") return json({ roles: [] });
      if (path === "/api/members") return json({ members: [] });
    }
    const m = path.match(/^\/api\/tasks\/(\d+)$/);
    if (m && method === "PATCH") {
      const cur = byId.get(Number(m[1]))!;
      const { repeatScope: _scope, ...fields } = body as Record<
        string,
        unknown
      >;
      const next = { ...cur, ...fields } as Task;
      byId.set(cur.id, next);
      return json({ tasks: [next] });
    }
    return json({ tasks: [] });
  });
  return log;
}

export function renderAt(path: string, routePath: string, ui: ReactNode) {
  return render(
    <DataProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={ui} />
        </Routes>
      </MemoryRouter>
    </DataProvider>,
  );
}
