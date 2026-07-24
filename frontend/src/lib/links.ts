import type { LinkType, TaskLink } from "../data/types";

// otherId — logical_id задачи на другом конце связи
export type LinkView = { linkId: number; label: string; otherId: number };

// Связи задачи с её точки зрения: сторона from показывает прямую подпись
// типа («блокирует»), сторона to — обратную («блокируется»); для
// ненаправленного типа обе стороны — одна подпись («связана с»).
export function linksForTask(
  links: TaskLink[],
  linkTypes: Map<number, LinkType>,
  logicalId: number,
): LinkView[] {
  const out: LinkView[] = [];
  for (const l of links) {
    const t = linkTypes.get(l.typeId);
    if (!t) continue;
    if (l.fromLogicalId === logicalId) {
      out.push({ linkId: l.id, label: t.name, otherId: l.toLogicalId });
    } else if (l.toLogicalId === logicalId) {
      out.push({
        linkId: l.id,
        label: t.directed ? t.reverseName : t.name,
        otherId: l.fromLogicalId,
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
export function linkCount(links: TaskLink[], logicalId: number): number {
  let n = 0;
  for (const l of links)
    if (l.fromLogicalId === logicalId || l.toLogicalId === logicalId) n++;
  return n;
}
