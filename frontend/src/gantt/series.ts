import type { Task } from "../data/types";

export type SeriesRow = {
  task: Task;
  depth: number;
  pastOccurrences: { date: string; done: boolean }[];
};

// Схлопывание серий повторов: в одну строку на носителе — живом
// вхождении (или последнем по дате, если живых нет). Прошлые вхождения
// серии становятся точками на его дорожке, их строки и поддеревья с
// Ганта убираются.
export function collapseSeries(flat: { task: Task; depth: number }[]): {
  rows: SeriesRow[];
  hiddenSubtreeRoots: Set<number>;
} {
  const bySeries = new Map<number, { task: Task; depth: number }[]>();
  for (const f of flat) {
    if (f.task.seriesId !== null) {
      const list = bySeries.get(f.task.seriesId) ?? [];
      list.push(f);
      bySeries.set(f.task.seriesId, list);
    }
  }
  const carriers = new Map<number, number>(); // seriesId -> carrier task id
  const hiddenSubtreeRoots = new Set<number>();
  for (const [sid, members] of bySeries) {
    const alive = members.filter((m) => !m.task.done);
    const pick = (list: { task: Task; depth: number }[]) =>
      list.reduce((a, b) =>
        (b.task.scheduledOn ?? "") > (a.task.scheduledOn ?? "") ? b : a,
      );
    const carrier = alive.length > 0 ? pick(alive) : pick(members);
    carriers.set(sid, carrier.task.id);
    for (const m of members) {
      if (m.task.id !== carrier.task.id) hiddenSubtreeRoots.add(m.task.id);
    }
  }
  const rows: SeriesRow[] = [];
  for (const f of flat) {
    const sid = f.task.seriesId;
    if (sid !== null && carriers.get(sid) !== f.task.id) continue;
    const past =
      sid !== null
        ? (bySeries.get(sid) ?? [])
            .filter(
              (m) => m.task.id !== f.task.id && m.task.scheduledOn !== null,
            )
            .map((m) => ({ date: m.task.scheduledOn!, done: m.task.done }))
            .sort((a, b) => (a.date < b.date ? -1 : 1))
        : [];
    rows.push({ task: f.task, depth: f.depth, pastOccurrences: past });
  }
  return { rows, hiddenSubtreeRoots };
}
