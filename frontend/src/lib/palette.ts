import type { Project, Task } from "../data/types";

export type PaletteItem =
  | { kind: "project"; id: number; label: string; color: string }
  | {
      kind: "task";
      id: number;
      label: string;
      done: boolean;
      projectId: number;
      projectName: string;
      color: string;
    };

// Поиск палитры: подстрока без регистра по активным проектам и их
// задачам; сначала совпадения с начала названия, внутри групп — проекты
// раньше задач, затем по алфавиту.
export function paletteMatches(
  tasks: Map<number, Task>,
  projects: Map<number, Project>,
  query: string,
  limit = 20,
): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const items: (PaletteItem & { starts: boolean })[] = [];
  for (const p of projects.values()) {
    if (p.archived) continue;
    const name = p.name.toLowerCase();
    if (!name.includes(q)) continue;
    items.push({
      kind: "project",
      id: p.id,
      label: p.name,
      color: p.color,
      starts: name.startsWith(q),
    });
  }
  for (const t of tasks.values()) {
    const proj = projects.get(t.projectId);
    if (!proj || proj.archived) continue;
    const title = t.title.toLowerCase();
    if (!title.includes(q)) continue;
    items.push({
      kind: "task",
      id: t.id,
      label: t.title,
      done: t.done,
      projectId: t.projectId,
      projectName: proj.name,
      color: proj.color,
      starts: title.startsWith(q),
    });
  }
  items.sort((a, b) => {
    if (a.starts !== b.starts) return a.starts ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "project" ? -1 : 1;
    return a.label.localeCompare(b.label, "ru");
  });
  return items.slice(0, limit).map(({ starts: _starts, ...item }) => item);
}
