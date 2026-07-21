import { useEffect, useRef, useState } from "react";
import { AvatarDot, MLabel, TrashIcon } from "../components/ui";
import { ConfirmButton } from "../components/ConfirmButton";
import { useData } from "../data/DataProvider";
import { PALETTE, nextColor, type Person } from "../data/types";
import { plural } from "../lib/plural";

// Раздел «Команда»: люди, которых можно назначать исполнителями.
export function TeamView() {
  const { people, tasks, loading, offline, retry, createPerson } = useData();
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

  const list = [...people.values()].sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <div className="max-w-[560px]">
      <div className="panel px-4 py-3">
        <MLabel className="px-2 pb-2">Команда</MLabel>
        {list.length === 0 && (
          <p className="px-2 py-2 text-[13px] text-dim">
            Пока никого. Добавь людей — и назначай их исполнителями задач; задача без исполнителя — твоя.
          </p>
        )}
        {list.map((p) => (
          <PersonRow key={p.id} person={p} taskCount={[...tasks.values()].filter((t) => t.assigneeId === p.id).length} />
        ))}
        <div className="prow prow-tight !border-b-0">
          <AvatarDot name={draft || "?"} color="var(--check)" size={26} />
          <input
            className="ghost-input flex-1 text-[13.5px]"
            name="new-person"
            aria-label="Новый человек"
            placeholder="＋ Имя Фамилия…"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Escape") setDraft("");
              if (e.key === "Enter" && draft.trim()) {
                setBusy(true);
                const p = await createPerson(draft.trim(), nextColor(people.size));
                setBusy(false);
                if (p) setDraft("");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PersonRow({ person, taskCount }: { person: Person; taskCount: number }) {
  const { patchPerson, removePerson } = useData();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.name);
  const [picker, setPicker] = useState(false);
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
    if (v && v !== person.name) void patchPerson(person.id, { name: v });
    else setName(person.name);
  };

  return (
    <div className="prow">
      <div className="relative flex items-center" ref={pickerRef}>
        <button type="button" title="Цвет" aria-label={`Цвет — ${person.name}`} onClick={() => setPicker((v) => !v)}>
          <AvatarDot name={person.name} color={person.color} size={26} />
        </button>
        {picker && (
          <div className="popover popover-left">
            <div className="mlabel mb-2">Цвет</div>
            <div className="grid grid-cols-6 gap-2 w-max">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch ${c === person.color ? "swatch-on" : ""}`}
                  style={{ background: c }}
                  aria-label={`Цвет ${c}`}
                  onClick={() => {
                    void patchPerson(person.id, { color: c });
                    setPicker(false);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {renaming ? (
        <input
          className="ghost-input flex-1 text-[13.5px]"
          name="person-name"
          aria-label="Имя"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => finishRename(name)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finishRename(name);
            if (e.key === "Escape") {
              setName(person.name);
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
          {person.name}
        </span>
      )}
      {taskCount > 0 && <span className="mmeta">{plural(taskCount, ["задача", "задачи", "задач"])}</span>}
      <ConfirmButton
        className="row-btn row-btn-danger"
        armedClassName="!bg-over/15 !text-over"
        confirmLabel="✓"
        title="Удалить (его задачи останутся без исполнителя)"
        onConfirm={() => void removePerson(person.id)}
      >
        <TrashIcon />
      </ConfirmButton>
    </div>
  );
}
