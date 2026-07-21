import { useEffect, useRef, useState } from "react";
import { MLabel, TrashIcon } from "../components/ui";
import { ConfirmButton } from "../components/ConfirmButton";
import { TypeBadge } from "../components/TypeBadge";
import { useData } from "../data/DataProvider";
import { plural } from "../lib/plural";
import type { TaskType } from "../data/types";

const EMOJI_PRESETS = ["💻", "🧪", "🤝", "📞", "📝", "🐛", "🎨", "🚀", "🔧", "📊"];

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

  const list = [...types.values()].sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <div className="max-w-[560px]">
      <div className="panel px-4 py-3">
        <MLabel className="px-2 pb-2">Типы задач</MLabel>
        {list.length === 0 && (
          <p className="px-2 py-2 text-[13px] text-dim">
            Пока пусто. Типы («разработка», «встреча», «qa»…) помечают задачи смайликом во всех видах.
          </p>
        )}
        {list.map((t) => (
          <TypeRow key={t.id} type={t} taskCount={[...tasks.values()].filter((x) => x.typeId === t.id).length} />
        ))}
        <div className="prow prow-tight !border-b-0">
          <span className="w-[26px] text-center text-[15px] flex-none" aria-hidden="true">
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
        Клик по смайлику — выбор из набора или любой свой (панель эмодзи macOS: ⌃⌘Space). Имя — двойной клик.
      </p>
    </div>
  );
}

function TypeRow({ type, taskCount }: { type: TaskType; taskCount: number }) {
  const { patchType, removeType } = useData();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(type.name);
  const [picker, setPicker] = useState(false);
  const [custom, setCustom] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(false);
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
    <div className="prow">
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
          <div className="popover popover-left" onClick={(e) => e.stopPropagation()}>
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
                maxLength={4}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && custom.trim()) {
                    void patchType(type.id, { emoji: custom.trim() });
                    setCustom("");
                    setPicker(false);
                  }
                }}
              />
              <span className="mmeta">свой · ⌃⌘Space</span>
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
      {taskCount > 0 && <span className="mmeta">{plural(taskCount, ["задача", "задачи", "задач"])}</span>}
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
