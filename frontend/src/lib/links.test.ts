import { describe, expect, it } from "vitest";
import { groupLinks, linkCount, linksForTask } from "./links";
import type { LinkType, TaskLink } from "../data/types";

const types = new Map<number, LinkType>([
  [1, { id: 1, name: "блокирует", reverseName: "блокируется", directed: true, position: 0 }],
  [2, { id: 2, name: "связана с", reverseName: "", directed: false, position: 1 }],
]);

describe("linksForTask", () => {
  it("направленный: from → прямая подпись, to → обратная", () => {
    const links: TaskLink[] = [{ id: 10, fromLogicalId: 1, toLogicalId: 2, typeId: 1 }];
    expect(linksForTask(links, types, 1)).toEqual([
      { linkId: 10, label: "блокирует", otherId: 2 },
    ]);
    expect(linksForTask(links, types, 2)).toEqual([
      { linkId: 10, label: "блокируется", otherId: 1 },
    ]);
  });
  it("ненаправленный: обе стороны — одна подпись", () => {
    const links: TaskLink[] = [{ id: 11, fromLogicalId: 3, toLogicalId: 4, typeId: 2 }];
    expect(linksForTask(links, types, 3)[0]).toMatchObject({ label: "связана с", otherId: 4 });
    expect(linksForTask(links, types, 4)[0]).toMatchObject({ label: "связана с", otherId: 3 });
  });
  it("неизвестный тип пропускается", () => {
    expect(linksForTask([{ id: 1, fromLogicalId: 1, toLogicalId: 2, typeId: 99 }], types, 1)).toEqual([]);
  });
});

describe("groupLinks", () => {
  it("группирует по подписи в порядке появления", () => {
    const views = [
      { linkId: 1, label: "блокирует", otherId: 2 },
      { linkId: 2, label: "блокирует", otherId: 3 },
      { linkId: 3, label: "связана с", otherId: 4 },
    ];
    const g = groupLinks(views);
    expect(g.map((x) => x.label)).toEqual(["блокирует", "связана с"]);
    expect(g[0].items).toHaveLength(2);
  });
});

describe("linkCount", () => {
  it("считает связи с обеих сторон", () => {
    const links: TaskLink[] = [
      { id: 1, fromLogicalId: 1, toLogicalId: 2, typeId: 1 },
      { id: 2, fromLogicalId: 3, toLogicalId: 1, typeId: 2 },
      { id: 3, fromLogicalId: 4, toLogicalId: 5, typeId: 1 },
    ];
    expect(linkCount(links, 1)).toBe(2);
    expect(linkCount(links, 5)).toBe(1);
  });
});
