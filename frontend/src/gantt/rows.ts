import type { Task } from "../data/types";

export type GRow = { task: Task; depth: number; hasChildren: boolean };

// У задачи есть хоть какая-то дата (план, конец, мягкий/жёсткий дедлайн).
export function hasDate(t: Task): boolean {
  return (
    t.scheduledOn !== null ||
    t.endOn !== null ||
    t.softDueOn !== null ||
    t.dueOn !== null
  );
}

// Плоский список строк задач проекта для Ганта.
//  - collapsed(id): поддерево свёрнуто — его потомки не разворачиваются;
//  - hideUndated: скрыть задачи без дат, НО оставить те, у кого в
//    поддереве есть датированная задача (иначе путь к ней порвётся);
//  - filter: общий фильтр Ганта (исполнитель/тип).
// hasChildren в строке считается БЕЗ учёта collapsed (чтобы у свёрнутого
// узла оставался шеврон) и с учётом видимости потомков (нет видимых —
// нет шеврона).
export function ganttTaskRows(
  roots: Task[],
  childrenOf: (id: number) => Task[],
  opts: {
    collapsed: (id: number) => boolean;
    hideUndated: boolean;
    filter: (t: Task) => boolean;
  },
): GRow[] {
  const datedCache = new Map<number, boolean>();
  const subtreeDated = (t: Task): boolean => {
    const c = datedCache.get(t.id);
    if (c !== undefined) return c;
    let v = hasDate(t);
    if (!v) {
      for (const k of childrenOf(t.id)) {
        if (subtreeDated(k)) {
          v = true;
          break;
        }
      }
    }
    datedCache.set(t.id, v);
    return v;
  };

  const visible = (t: Task): boolean =>
    opts.filter(t) && (!opts.hideUndated || subtreeDated(t));

  const hasVisCache = new Map<number, boolean>();
  const hasVisibleDescendant = (t: Task): boolean => {
    const c = hasVisCache.get(t.id);
    if (c !== undefined) return c;
    let v = false;
    for (const k of childrenOf(t.id)) {
      if (visible(k) || hasVisibleDescendant(k)) {
        v = true;
        break;
      }
    }
    hasVisCache.set(t.id, v);
    return v;
  };

  const out: GRow[] = [];
  const walk = (nodes: Task[], depth: number) => {
    for (const t of nodes) {
      if (visible(t)) {
        out.push({ task: t, depth, hasChildren: hasVisibleDescendant(t) });
      }
      // потомки отфильтрованного родителя показываются независимо;
      // свёрнутый узел прячет своё поддерево
      if (!opts.collapsed(t.id)) walk(childrenOf(t.id), depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}
