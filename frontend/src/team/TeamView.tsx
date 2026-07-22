import { useEffect, useRef, useState } from "react";
import { AvatarDot, MLabel, TrashIcon } from "../components/ui";
import { ConfirmButton } from "../components/ConfirmButton";
import { useData } from "../data/DataProvider";
import { PALETTE, nextColor, type Person, type Role } from "../data/types";
import { plural } from "../lib/plural";
import { setDragGhost } from "../tree/dnd";

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

  const list = [...people.values()].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

  return (
    <div className="max-w-[960px]">
      <div className="flex gap-4 items-start flex-wrap">
        <div className="panel px-4 py-3 flex-1 min-w-[380px]">
          <MLabel className="px-2 pb-2">Команда</MLabel>
          {list.length === 0 && (
            <p className="px-2 py-2 text-[13px] text-dim">
              Пока никого. Добавь людей — и назначай их исполнителями задач;
              задача без исполнителя — твоя.
            </p>
          )}
          {list.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              list={list}
              taskCount={
                [...tasks.values()].filter((t) => t.assigneeId === p.id).length
              }
            />
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
                  const p = await createPerson(
                    draft.trim(),
                    nextColor(people.size),
                  );
                  setBusy(false);
                  if (p) setDraft("");
                }
              }}
            />
          </div>
        </div>

        <RolesPanel />
      </div>
      <p className="pt-3 text-[12px] text-dim">
        Имя и роль — двойной клик; цвет — клик по кружку; удаление — корзина,
        второй клик подтверждает.
      </p>
    </div>
  );
}

// Справочник ролей: назначаются людям выпадашкой в строке человека.
function RolesPanel() {
  const { roles, people, createRole, patchRole, removeRole } = useData();
  const [draft, setDraft] = useState("");

  const list = [...roles.values()].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  );

  return (
    <div className="panel px-4 py-3 w-[320px]">
      <MLabel className="px-2 pb-2">Роли</MLabel>
      {list.length === 0 && (
        <p className="px-2 py-2 text-[13px] text-dim">
          Например «Backend», «QA», «Дизайн» — потом назначь людям.
        </p>
      )}
      {list.map((r) => (
        <RoleRow
          key={r.id}
          role={r}
          list={list}
          count={[...people.values()].filter((p) => p.roleId === r.id).length}
          patchRole={patchRole}
          removeRole={removeRole}
        />
      ))}
      <div className="prow prow-tight !border-b-0">
        <span className="w-[26px] text-center flex-none" aria-hidden="true">
          ＋
        </span>
        <input
          className="ghost-input flex-1 text-[13.5px]"
          name="new-role"
          aria-label="Новая роль"
          placeholder="Новая роль…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Escape") setDraft("");
            if (e.key === "Enter" && draft.trim()) {
              const r = await createRole(draft.trim());
              if (r) setDraft("");
            }
          }}
        />
      </div>
    </div>
  );
}

function RoleRow({
  role,
  list,
  count,
  patchRole,
  removeRole,
}: {
  role: Role;
  list: Role[];
  count: number;
  patchRole: (
    id: number,
    p: { name?: string; position?: number },
  ) => Promise<void>;
  removeRole: (id: number) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(role.name);
  const [dropZone, setDropZone] = useState<"before" | "after" | null>(null);

  const finish = (v: string) => {
    setRenaming(false);
    const t = v.trim();
    if (t && t !== role.name) void patchRole(role.id, { name: t });
    else setName(role.name);
  };

  return (
    <div
      className={`prow prow-tight relative ${dropZone === "before" ? "drop-before" : dropZone === "after" ? "drop-after" : ""}`}
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-workspace-role", String(role.id));
        setDragGhost(e, e.currentTarget as HTMLElement);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-workspace-role"))
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
          e.dataTransfer.getData("application/x-workspace-role"),
        );
        if (!Number.isFinite(dragId) || dragId === role.id) return;
        const others = list.filter((x) => x.id !== dragId);
        const idx = others.findIndex((x) => x.id === role.id);
        void patchRole(dragId, { position: zone === "before" ? idx : idx + 1 });
      }}
    >
      {renaming ? (
        <input
          className="ghost-input flex-1 text-[13.5px]"
          name="role-name"
          aria-label="Имя роли"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => finish(name)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(name);
            if (e.key === "Escape") {
              setName(role.name);
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
          {role.name}
        </span>
      )}
      {count > 0 && <span className="mmeta">{count}</span>}
      <ConfirmButton
        className="row-btn row-btn-danger"
        armedClassName="!bg-over/15 !text-over"
        confirmLabel="✓"
        title="Удалить роль (у людей она снимется)"
        onConfirm={() => void removeRole(role.id)}
      >
        <TrashIcon />
      </ConfirmButton>
    </div>
  );
}

function PersonRow({
  person,
  list,
  taskCount,
}: {
  person: Person;
  list: Person[];
  taskCount: number;
}) {
  const { roles, patchPerson, removePerson } = useData();
  const [dropZone, setDropZone] = useState<"before" | "after" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.name);
  const [picker, setPicker] = useState(false);
  const [roleMenu, setRoleMenu] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roleMenu) return;
    const onDown = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node))
        setRoleMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRoleMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [roleMenu]);

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
    if (v && v !== person.name) void patchPerson(person.id, { name: v });
    else setName(person.name);
  };

  return (
    <div
      className={`prow relative ${dropZone === "before" ? "drop-before" : dropZone === "after" ? "drop-after" : ""}`}
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "application/x-workspace-person",
          String(person.id),
        );
        setDragGhost(e, e.currentTarget as HTMLElement);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-workspace-person"))
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
          e.dataTransfer.getData("application/x-workspace-person"),
        );
        if (!Number.isFinite(dragId) || dragId === person.id) return;
        const others = list.filter((x) => x.id !== dragId);
        const idx = others.findIndex((x) => x.id === person.id);
        void patchPerson(dragId, {
          position: zone === "before" ? idx : idx + 1,
        });
      }}
    >
      <div className="relative flex items-center" ref={pickerRef}>
        <button
          type="button"
          title="Цвет"
          aria-label={`Цвет — ${person.name}`}
          onClick={() => setPicker((v) => !v)}
        >
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
      <div className="relative" ref={roleRef}>
        <button
          type="button"
          className={`chip ${person.roleId !== null ? "chip-accent" : ""}`}
          title="Роль"
          onClick={() => setRoleMenu((v) => !v)}
        >
          {person.roleId !== null
            ? (roles.get(person.roleId)?.name ?? "роль")
            : "роль"}
        </button>
        {roleMenu && (
          <div
            className="popover popover-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-0.5 min-w-[150px]">
              <button
                type="button"
                className="pop-item"
                onClick={() => {
                  void patchPerson(person.id, { roleId: null });
                  setRoleMenu(false);
                }}
              >
                <span>без роли</span>
                {person.roleId === null && <span className="mmeta">✓</span>}
              </button>
              {[...roles.values()]
                .sort((a, b) => a.position - b.position || a.id - b.id)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="pop-item"
                    onClick={() => {
                      void patchPerson(person.id, { roleId: r.id });
                      setRoleMenu(false);
                    }}
                  >
                    <span>{r.name}</span>
                    {person.roleId === r.id && <span className="mmeta">✓</span>}
                  </button>
                ))}
              {roles.size === 0 && (
                <p className="text-[12px] text-dim px-2.5 py-1 m-0">
                  Создай роли ниже.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {taskCount > 0 && (
        <span className="mmeta">
          {plural(taskCount, ["задача", "задачи", "задач"])}
        </span>
      )}
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
