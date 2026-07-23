import type { LinkType, TaskLink } from "../data/types";

export type LinkView = { linkId: number; label: string; otherId: number };

// Связи задачи с её точки зрения: сторона from показывает прямую подпись
// типа («блокирует»), сторона to — обратную («блокируется»); для
// ненаправленного типа обе стороны — одна подпись («связана с»).
export function linksForTask(
  links: TaskLink[],
  linkTypes: Map<number, LinkType>,
  taskId: number,
): LinkView[] {
  const out: LinkView[] = [];
  for (const l of links) {
    const t = linkTypes.get(l.typeId);
    if (!t) continue;
    if (l.fromId === taskId) {
      out.push({ linkId: l.id, label: t.name, otherId: l.toId });
    } else if (l.toId === taskId) {
      out.push({
        linkId: l.id,
        label: t.directed ? t.reverseName : t.name,
        otherId: l.fromId,
      });
    }
  }
  return out;
}

// Группировка связей по подписи (для секции «Связи» в инспекторе), в
// порядке появления подписей.
export function groupLinks(views: LinkView[]): { label: string; items: LinkView[] }[] {
  const order: string[] = [];
  const map = new Map<string, LinkView[]>();
  for (const v of views) {
    if (!map.has(v.label)) {
      map.set(v.label, []);
      order.push(v.label);
    }
    map.get(v.label)!.push(v);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

// Число связей задачи (для бейджа в дереве).
export function linkCount(links: TaskLink[], taskId: number): number {
  let n = 0;
  for (const l of links) if (l.fromId === taskId || l.toId === taskId) n++;
  return n;
}
