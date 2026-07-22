import type { Project, Task } from "./types";

// Чистые выборки из Map задач. Дерево и день собираются на клиенте —
// сервер отдаёт плоский список.

export function rootTasks(tasks: Map<number, Task>, projectId: number): Task[] {
  const out: Task[] = [];
  for (const t of tasks.values()) {
    if (t.parentId === null && t.projectId === projectId) out.push(t);
  }
  return out.sort((a, b) => a.position - b.position || a.id - b.id);
}

export function sortedProjects(projects: Map<number, Project>): Project[] {
  return [...projects.values()].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );
}

export function childProjects(
  projects: Map<number, Project>,
  parentId: number | null,
): Project[] {
  const out: Project[] = [];
  for (const p of projects.values()) {
    if (p.parentId === parentId) out.push(p);
  }
  return out.sort((a, b) => a.position - b.position || a.id - b.id);
}

export function projectSubtreeIds(
  projects: Map<number, Project>,
  id: number,
): number[] {
  const out: number[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    out.push(cur);
    for (const p of projects.values()) {
      if (p.parentId === cur) stack.push(p.id);
    }
  }
  return out;
}

// Несделанные задачи всего поддерева проектов.
export function projectUndone(
  tasks: Map<number, Task>,
  projects: Map<number, Project>,
  projectId: number,
): number {
  // архивные подпроекты не считаем: их задачи скрыты из всех видов
  const ids = new Set(
    projectSubtreeIds(projects, projectId).filter(
      (id) => !projects.get(id)?.archived,
    ),
  );
  let n = 0;
  for (const t of tasks.values()) {
    if (ids.has(t.projectId) && !t.done) n++;
  }
  return n;
}

// Проекты не-архивные, развёрнутые в порядке дерева (для поповеров выбора).
export function flattenActiveProjects(
  projects: Map<number, Project>,
): { project: Project; depth: number }[] {
  const out: { project: Project; depth: number }[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const p of childProjects(projects, parentId)) {
      if (p.archived) continue;
      out.push({ project: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function isTaskVisible(
  projects: Map<number, Project>,
  t: Task,
): boolean {
  return !(projects.get(t.projectId)?.archived ?? false);
}

export function childrenOf(
  tasks: Map<number, Task>,
  parentId: number | null,
): Task[] {
  const out: Task[] = [];
  for (const t of tasks.values()) {
    if (t.parentId === parentId) out.push(t);
  }
  return out.sort((a, b) => a.position - b.position || a.id - b.id);
}

// «Продолжения» многодневных задач: iso внутри диапазона, но не первый день.
export function spanTasksOn(tasks: Map<number, Task>, iso: string): Task[] {
  const out: Task[] = [];
  for (const t of tasks.values()) {
    if (
      t.scheduledOn !== null &&
      t.endOn !== null &&
      t.scheduledOn < iso &&
      iso <= t.endOn
    )
      out.push(t);
  }
  return out.sort(
    (a, b) => a.scheduledOn!.localeCompare(b.scheduledOn!) || a.id - b.id,
  );
}

export function tasksOn(tasks: Map<number, Task>, iso: string): Task[] {
  const out: Task[] = [];
  for (const t of tasks.values()) {
    if (t.scheduledOn === iso) out.push(t);
  }
  return out.sort(
    (a, b) => (a.dayPosition ?? 0) - (b.dayPosition ?? 0) || a.id - b.id,
  );
}

// Сорванные дедлайны — приоритетная категория просрочки.
export function overdueDeadline(
  tasks: Map<number, Task>,
  todayIso: string,
): Task[] {
  const out: Task[] = [];
  for (const t of tasks.values()) {
    if (!t.done && t.dueOn !== null && t.dueOn < todayIso) out.push(t);
  }
  return out.sort(
    (a, b) =>
      (a.dueOn! < b.dueOn! ? -1 : a.dueOn! > b.dueOn! ? 1 : 0) || a.id - b.id,
  );
}

// Невыполненный план дня; задачи с сорванным дедлайном сюда не попадают —
// они уже показаны в секции дедлайнов. Диапазон работы просрочен по
// своему концу, не по началу — пока идёт, он не «не сделан».
export function overdue(tasks: Map<number, Task>, todayIso: string): Task[] {
  const out: Task[] = [];
  for (const t of tasks.values()) {
    const planEnd = t.endOn ?? t.scheduledOn;
    if (
      !t.done &&
      planEnd !== null &&
      planEnd < todayIso &&
      !(t.dueOn !== null && t.dueOn < todayIso)
    ) {
      out.push(t);
    }
  }
  return out.sort(
    (a, b) =>
      (a.scheduledOn! < b.scheduledOn!
        ? -1
        : a.scheduledOn! > b.scheduledOn!
          ? 1
          : 0) || a.id - b.id,
  );
}

// «Проект X / Бэкенд» — путь родителей сверху вниз, без самого узла.
export function breadcrumb(tasks: Map<number, Task>, id: number): string {
  const names: string[] = [];
  let cur = tasks.get(id)?.parentId ?? null;
  // защита от битых данных с циклом — не зависаем
  const seen = new Set<number>();
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur);
    const p = tasks.get(cur);
    if (!p) break;
    names.unshift(p.title);
    cur = p.parentId;
  }
  return names.join(" / ");
}

export function subtreeIds(tasks: Map<number, Task>, id: number): number[] {
  const out: number[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    out.push(cur);
    for (const t of tasks.values()) {
      if (t.parentId === cur) stack.push(t.id);
    }
  }
  return out;
}

export function childStats(
  tasks: Map<number, Task>,
  id: number,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const t of tasks.values()) {
    if (t.parentId === id) {
      total++;
      if (t.done) done++;
    }
  }
  return { done, total };
}
