import { useEffect, useRef, useState } from "react";
import { MLabel, TrashIcon } from "../components/ui";
import { ConfirmButton } from "../components/ConfirmButton";
import { TypeBadge } from "../components/TypeBadge";
import { useData } from "../data/DataProvider";
import { setDragGhost } from "../tree/dnd";
import { plural } from "../lib/plural";
import { lastGrapheme } from "../lib/emoji";
import type { LinkType, TaskType } from "../data/types";

const EMOJI_PRESETS = [
  "💻",
  "🧪",
  "🤝",
  "📞",
  "📝",
  "🐛",
  "🎨",
  "🚀",
  "🔧",
  "📊",
];

// Раздел «Типы»: справочник типов задач с эмодзи.
export function TypesView() {
  const { types, tasks, loading, offline, retry, createType } = useData();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <p className="text-[13px] text-dim">Загрузка…</p>;
  }
  if (offline) {
    return (
      <div className="banner">
        Нет связи с сервером
        <button type="button" className="seg" onClick={retry}>
          Повторить
        </button>
      </div>
    );
  }

  const list = [...types.values()].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 items-start max-w-[940px]">
      <div>
      <div className="panel px-4 py-3">
        <MLabel className="px-2 pb-2">Типы задач</MLabel>
        {list.length === 0 && (
          <p className="px-2 py-2 text-[13px] text-dim">
            Пока пусто. Типы («разработка», «встреча», «qa»…) помечают задачи
            смайликом во всех видах.
          </p>
        )}
        {list.map((t) => (
          <TypeRow
            key={t.id}
            type={t}
            list={list}
            taskCount={
              [...tasks.values()].filter((x) => x.typeId === t.id).length
            }
          />
        ))}
        <div className="prow prow-tight !border-b-0">
          <span
            className="w-[26px] text-center text-[15px] flex-none"
            aria-hidden="true"
          >
            ＋
          </span>
          <input
            className="ghost-input flex-1 text-[13.5px]"
            name="new-type"
            aria-label="Новый тип"
            placeholder="Новый тип…"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Escape") setDraft("");
              if (e.key === "Enter" && draft.trim()) {
                setBusy(true);
                const t = await createType(draft.trim(), "");
                setBusy(false);
                if (t) setDraft("");
              }
            }}
          />
        </div>
      </div>
      <p className="pt-3 text-[12px] text-dim">
        Клик по смайлику — выбор из набора или любой свой (панель эмодзи macOS:
        ⌃⌘Space). Имя — двойной клик.
      </p>
      </div>

      <LinkTypesPanel />
    </div>
  );
}

function LinkTypesPanel() {
  const { linkTypes, createLinkType } = useData();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const list = [...linkTypes.values()].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );
  return (
    <div className="panel px-4 py-3">
      <MLabel className="px-2 pb-2">Типы связей</MLabel>
      {list.map((lt) => (
        <LinkTypeRow key={lt.id} type={lt} />
      ))}
      <div className="prow prow-tight !border-b-0">
        <span
          className="w-[26px] text-center text-[15px] flex-none"
          aria-hidden="true"
        >
          ＋
        </span>
        <input
          className="ghost-input flex-1 text-[13.5px]"
          name="new-link-type"
          aria-label="Новый тип связи"
          placeholder="Новый тип связи (по умолчанию — ненаправленный)…"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Escape") setDraft("");
            if (e.key === "Enter" && draft.trim()) {
              setBusy(true);
              const lt = await createLinkType(draft.trim(), "", false);
              setBusy(false);
              if (lt) setDraft("");
            }
          }}
        />
      </div>
      <p className="px-2 pt-2 text-[12px] text-dim m-0">
        Направленная связь имеет прямую и обратную подпись (блокирует /
        блокируется). Ненаправленная — одну (связана с). Имена — двойной клик.
      </p>
    </div>
  );
}

function LinkTypeRow({ type }: { type: LinkType }) {
  const { patchLinkType, removeLinkType } = useData();
  const [renaming, setRenaming] = useState<"name" | "reverse" | null>(null);

  const rename = (field: "name" | "reverse", value: string) => {
    setRenaming(null);
    const v = value.trim();
    if (field === "name") {
      if (v && v !== type.name) void patchLinkType(type.id, { name: v });
    } else {
      if (v !== type.reverseName)
        void patchLinkType(type.id, { reverseName: v });
    }
  };

  return (
    <div className="prow">
      <button
        type="button"
        className={`seg !px-2 !py-1 !text-[11px] flex-none ${type.directed ? "seg-on" : ""}`}
        title={type.directed ? "Направленная" : "Ненаправленная"}
        onClick={() => void patchLinkType(type.id, { directed: !type.directed })}
      >
        {type.directed ? "→" : "↔"}
      </button>
      {renaming === "name" ? (
        <input
          className="ghost-input flex-1 text-[13.5px]"
          name="link-type-name"
          aria-label="Прямая подпись"
          defaultValue={type.name}
          autoFocus
          onBlur={(e) => rename("name", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename("name", e.currentTarget.value);
            if (e.key === "Escape") setRenaming(null);
          }}
        />
      ) : (
        <span
          className="flex-1 min-w-0 truncate text-[13.5px]"
          title="Двойной клик — переименовать"
          onDoubleClick={() => setRenaming("name")}
        >
          {type.name}
        </span>
      )}
      {type.directed &&
        (renaming === "reverse" ? (
          <input
            className="ghost-input flex-1 text-[13.5px] text-dim"
            name="link-type-reverse"
            aria-label="Обратная подпись"
            defaultValue={type.reverseName}
            autoFocus
            onBlur={(e) => rename("reverse", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename("reverse", e.currentTarget.value);
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-[12.5px] text-dim"
            title="Обратная подпись — двойной клик"
            onDoubleClick={() => setRenaming("reverse")}
          >
            {type.reverseName || "обратная подпись…"}
          </span>
        ))}
      <ConfirmButton
        className="row-btn row-btn-danger"
        armedClassName="!bg-over/15 !text-over"
        confirmLabel="✓"
        title="Удалить тип связи (связи этого типа исчезнут)"
        onConfirm={() => void removeLinkType(type.id)}
      >
        <TrashIcon />
      </ConfirmButton>
    </div>
  );
}

function TypeRow({
  type,
  taskCount,
  list,
}: {
  type: TaskType;
  taskCount: number;
  list: TaskType[];
}) {
  const { patchType, removeType } = useData();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(type.name);
  const [picker, setPicker] = useState(false);
  const [custom, setCustom] = useState("");
  const [dropZone, setDropZone] = useState<"before" | "after" | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // при открытии показываем текущий не-пресетный смайл в поле
  useEffect(() => {
    if (picker) setCustom(EMOJI_PRESETS.includes(type.emoji) ? "" : type.emoji);
  }, [picker, type.emoji]);

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setPicker(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picker]);

  const finishRename = (value: string) => {
    setRenaming(false);
    const v = value.trim();
    if (v && v !== type.name) void patchType(type.id, { name: v });
    else setName(type.name);
  };

  return (
    <div
      className={`prow relative ${dropZone === "before" ? "drop-before" : dropZone === "after" ? "drop-after" : ""}`}
      draggable={!renaming && !picker}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-workspace-type", String(type.id));
        setDragGhost(e, e.currentTarget as HTMLElement);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-workspace-type"))
          return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setDropZone(e.clientY - r.top < r.height / 2 ? "before" : "after");
      }}
      onDragLeave={() => setDropZone(null)}
      onDrop={(e) => {
        e.preventDefault();
        const zone = dropZone;
        setDropZone(null);
        const dragId = Number(
          e.dataTransfer.getData("application/x-workspace-type"),
        );
        if (!Number.isFinite(dragId) || dragId === type.id) return;
        const others = list.filter((x) => x.id !== dragId);
        const idx = others.findIndex((x) => x.id === type.id);
        void patchType(dragId, { position: zone === "before" ? idx : idx + 1 });
      }}
    >
      <div className="relative flex items-center" ref={pickerRef}>
        <button
          type="button"
          className="w-[26px] h-[26px] rounded-[8px] border border-line flex items-center justify-center text-[14px]"
          title="Смайлик типа"
          aria-label={`Смайлик типа ${type.name}`}
          onClick={() => setPicker((v) => !v)}
        >
          {type.emoji || <TypeBadge type={type} />}
        </button>
        {picker && (
          <div
            className="popover popover-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mlabel mb-2">Смайлик</div>
            <div className="grid grid-cols-5 gap-1.5 w-max pb-2">
              {EMOJI_PRESETS.map((em) => (
                <button
                  key={em}
                  type="button"
                  className={`w-[30px] h-[28px] rounded-[8px] text-[15px] hover:bg-asoft ${type.emoji === em ? "bg-asoft" : ""}`}
                  onClick={() => {
                    void patchType(type.id, { emoji: em });
                    setPicker(false);
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input
                className="ghost-input border border-line rounded-[8px] px-2 py-1 text-[14px] w-[64px] text-center"
                name="custom-emoji"
                aria-label="Свой смайлик"
                placeholder="🙂"
                value={custom}
                onChange={(e) => setCustom(lastGrapheme(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && custom.trim()) {
                    void patchType(type.id, { emoji: custom.trim() });
                    setPicker(false);
                  }
                }}
              />
              <span className="mmeta">свой</span>
              {type.emoji && (
                <button
                  type="button"
                  className="mmeta !text-over"
                  onClick={() => {
                    void patchType(type.id, { emoji: "" });
                    setPicker(false);
                  }}
                >
                  убрать
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {renaming ? (
        <input
          className="ghost-input flex-1 text-[13.5px]"
          name="type-name"
          aria-label="Имя типа"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => finishRename(name)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishRename(name);
            if (e.key === "Escape") {
              setName(type.name);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <span
          className="flex-1 min-w-0 truncate text-[13.5px]"
          title="Двойной клик — переименовать"
          onDoubleClick={() => setRenaming(true)}
        >
          {type.name}
        </span>
      )}
      {taskCount > 0 && (
        <span className="mmeta">
          {plural(taskCount, ["задача", "задачи", "задач"])}
        </span>
      )}
      <ConfirmButton
        className="row-btn row-btn-danger"
        armedClassName="!bg-over/15 !text-over"
        confirmLabel="✓"
        title="Удалить тип (задачи останутся без типа)"
        onConfirm={() => void removeType(type.id)}
      >
        <TrashIcon />
      </ConfirmButton>
    </div>
  );
}
