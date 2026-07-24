import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../data/DataProvider";
import type { Task } from "../data/types";
import { groupLinks, linksForTask } from "../lib/links";
import { AnchoredPopover } from "./AnchoredPopover";
import { MLabel } from "./ui";

// Секция «Связи» в инспекторе задачи: списки связей по подписям + пикер
// «＋ связать» (поиск задачи → выбор типа/направления). Клик по связанной
// задаче открывает её в инспекторе (?task); подсветку в дереве шлём разовым
// сигналом в navigation state (не в URL — адрес остаётся чистым).
export function TaskLinks({ task }: { task: Task }) {
  const { tasks, linkTypes, taskLinks, createLink, removeLink } = useData();
  const navigate = useNavigate();
  const addRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);

  const groups = groupLinks(linksForTask(taskLinks, linkTypes, task.id));

  const goTo = (id: number) => {
    const t = tasks.get(id);
    if (!t) return;
    navigate(`/projects/${t.projectId}?task=${id}`, { state: { focus: id } });
  };

  return (
    <div>
      <div className="flex items-center justify-between pb-1">
        <MLabel>Связи</MLabel>
        <button
          ref={addRef}
          type="button"
          className="mmeta !text-accent"
          onClick={() => setPicking((v) => !v)}
        >
          ＋ связать
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-[12px] text-dim m-0 pb-1">Пока нет связей.</p>
      ) : (
        <div className="flex flex-col gap-1.5 pb-1">
          {groups.map((g) => (
            <div key={g.label}>
              <span className="mmeta">{g.label}</span>
              <div className="flex flex-col gap-0.5 pt-0.5">
                {g.items.map((it) => {
                  const other = tasks.get(it.otherId);
                  return (
                    <div key={it.linkId} className="link-row">
                      <button
                        type="button"
                        className="flex-1 min-w-0 truncate text-left text-[13px]"
                        title="Перейти к задаче"
                        onClick={() => goTo(it.otherId)}
                      >
                        {other?.title ?? "—"}
                      </button>
                      <button
                        type="button"
                        className="row-btn row-btn-danger"
                        title="Снять связь"
                        onClick={() => void removeLink(it.linkId)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {picking && (
        <AnchoredPopover anchorRef={addRef} onClose={() => setPicking(false)}>
          <LinkPicker
            task={task}
            onDone={() => setPicking(false)}
            onCreate={createLink}
          />
        </AnchoredPopover>
      )}
    </div>
  );
}

function LinkPicker({
  task,
  onDone,
  onCreate,
}: {
  task: Task;
  onDone: () => void;
  onCreate: (fromId: number, toId: number, typeId: number) => Promise<void>;
}) {
  const { tasks, linkTypes } = useData();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Task | null>(null);

  const q = query.trim().toLowerCase();
  const matches =
    q === ""
      ? []
      : [...tasks.values()]
          .filter((t) => t.id !== task.id && t.title.toLowerCase().includes(q))
          .slice(0, 12);

  const types = [...linkTypes.values()].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

  // варианты связи с выбранной задачей: для направленных — обе стороны
  const options = target
    ? types.flatMap((t) =>
        t.directed
          ? [
              { label: t.name, from: task.id, to: target.id, typeId: t.id },
              {
                label: t.reverseName,
                from: target.id,
                to: task.id,
                typeId: t.id,
              },
            ]
          : [{ label: t.name, from: task.id, to: target.id, typeId: t.id }],
      )
    : [];

  if (!target) {
    return (
      <div className="w-[240px]">
        <div className="mlabel pb-1.5">Связать с задачей</div>
        <input
          className="ghost-input border border-line rounded-[8px] px-2 py-1 text-[13px] w-full"
          name="link-search"
          aria-label="Поиск задачи"
          placeholder="Найти задачу…"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-col gap-0.5 pt-1.5 max-h-[240px] overflow-y-auto">
          {matches.map((t) => (
            <button
              key={t.id}
              type="button"
              className="pop-item"
              onClick={() => setTarget(t)}
            >
              <span className="truncate">{t.title}</span>
            </button>
          ))}
          {q !== "" && matches.length === 0 && (
            <p className="text-[12px] text-dim px-2.5 py-1 m-0">
              Ничего не нашлось.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-[240px]">
      <div className="mlabel pb-1.5">
        Как связать с «{target.title}»
      </div>
      <div className="flex flex-col gap-0.5">
        {options.map((o, i) => (
          <button
            key={`${o.typeId}-${i}`}
            type="button"
            className="pop-item"
            onClick={async () => {
              await onCreate(o.from, o.to, o.typeId);
              onDone();
            }}
          >
            <span className="truncate">{o.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mmeta pt-1.5"
        onClick={() => setTarget(null)}
      >
        ← другая задача
      </button>
    </div>
  );
}
