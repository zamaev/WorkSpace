import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { paletteMatches, type PaletteItem } from "../lib/palette";
import { SDot } from "./ui";

// ⌘K/Ctrl+K — палитра поиска по задачам и активным проектам. Выбор ведёт
// в «Проекты»: задача — с раскрытием пути и подсветкой (?focus=).
export function CommandPalette() {
  const { tasks, projects } = useData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // прокрутка стрелками двигает список под неподвижным курсором — такие
  // mouseenter игнорируем, пока мышь реально не шевельнулась
  const kbNav = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setIdx(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const items = paletteMatches(tasks, projects, query);
  const active = Math.min(idx, Math.max(items.length - 1, 0));

  const go = (item: PaletteItem) => {
    setOpen(false);
    if (item.kind === "project") navigate(`/projects/${item.id}`);
    else navigate(`/projects/${item.projectId}?focus=${item.id}`);
  };

  const scrollTo = (i: number) => {
    listRef.current?.children[i]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <>
      <div className="sheet-overlay" onClick={() => setOpen(false)} />
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Поиск"
      >
        <input
          className="ghost-input w-full text-[14px] px-1 pb-2"
          name="palette-query"
          aria-label="Поиск задач и проектов"
          placeholder="Найти задачу или проект…"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              kbNav.current = true;
              const n = Math.min(active + 1, items.length - 1);
              setIdx(n);
              scrollTo(n);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              kbNav.current = true;
              const n = Math.max(active - 1, 0);
              setIdx(n);
              scrollTo(n);
            }
            if (e.key === "Enter" && items[active]) go(items[active]);
          }}
        />
        <div
          ref={listRef}
          className="flex flex-col gap-0.5 max-h-[320px] overflow-y-auto"
        >
          {items.map((item, i) => (
            <button
              key={`${item.kind}${item.id}`}
              type="button"
              className={`pop-item ${i === active ? "bg-asoft" : ""}`}
              onMouseEnter={() => {
                if (!kbNav.current) setIdx(i);
              }}
              onMouseMove={() => {
                kbNav.current = false;
              }}
              onClick={() => go(item)}
            >
              <span
                className={`flex items-center gap-2 min-w-0 ${item.kind === "task" && item.done ? "text-dim line-through" : ""}`}
              >
                <SDot color={item.color} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="mmeta flex-none">
                {item.kind === "project" ? "проект" : item.projectName}
              </span>
            </button>
          ))}
          {query.trim() !== "" && items.length === 0 && (
            <p className="text-[12.5px] text-dim px-1 py-2 m-0">
              Ничего не нашлось.
            </p>
          )}
          {query.trim() === "" && (
            <p className="text-[12.5px] text-dim px-1 py-2 m-0">
              Ищет по названиям задач и проектов. ↑/↓ и Enter — переход.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
