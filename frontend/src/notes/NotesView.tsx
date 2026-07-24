import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useData } from "../data/DataProvider";
import { noteChildren, noteSubtreeIds } from "../data/selectors";
import type { Note } from "../data/types";
import { MLabel, TrashIcon } from "../components/ui";
import { NoteEditor } from "./NoteEditor";
import { ConfirmButton } from "../components/ConfirmButton";
import { ColResize, readWidth } from "../components/ColResize";
import { looksLikeHtml, markdownToHtml } from "./migrate";

const NOTE_MIME = "application/x-workspace-note";
const CLOSED_KEY = "workspace-notes-closed";
const NOTES_W_KEY = "workspace-col-notes";

function loadClosed(): Set<number> {
  try {
    const raw = localStorage.getItem(CLOSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {
    // битый localStorage — всё раскрыто
  }
  return new Set();
}

// текст заметки без HTML-тегов — для полнотекстового поиска
function notePlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// фрагмент текста вокруг совпадения — сниппет в результатах поиска
function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 80);
  const start = Math.max(0, i - 30);
  return (start > 0 ? "…" : "") + text.slice(start, start + 90).trim() + "…";
}

export function NotesView() {
  const { notes, createNote, patchNote } = useData();
  const { id } = useParams();
  const navigate = useNavigate();
  const selectedId = id ? Number(id) : null;

  const [sideW, setSideW] = useState(() => readWidth(NOTES_W_KEY, 280, 200, 480));
  const [query, setQuery] = useState("");

  // разовая миграция markdown → HTML для заметок, созданных до перехода
  // на HTML-хранение; редактор показываем только когда мигрировать нечего
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || notes.size === 0) return;
    migrated.current = true;
    for (const n of notes.values()) {
      if (n.body.trim() !== "" && !looksLikeHtml(n.body)) {
        const html = markdownToHtml(n.body);
        if (html && html !== n.body) void patchNote(n.id, { body: html });
      }
    }
  }, [notes, patchNote]);
  const needsMigration = [...notes.values()].some(
    (n) => n.body.trim() !== "" && !looksLikeHtml(n.body),
  );

  const [closed, setClosed] = useState<Set<number>>(loadClosed);
  const toggleOpen = (nid: number) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(nid)) next.delete(nid);
      else next.add(nid);
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        // недоступный localStorage — состояние до перезагрузки
      }
      return next;
    });
  };

  const roots = noteChildren(notes, null);
  const selected = selectedId !== null ? notes.get(selectedId) : undefined;

  const addRoot = async () => {
    const n = await createNote("", null);
    if (n) navigate(`/notes/${n.id}`);
  };

  return (
    <div className="notes-layout">
      <div
        className="notes-side panel px-2 py-3"
        style={{ ["--notes-w"]: `${sideW}px` } as CSSProperties}
      >
        <div className="flex items-center justify-between px-2 pb-2">
          <MLabel>Заметки</MLabel>
          <button
            type="button"
            className="row-btn"
            title="Новая заметка"
            onClick={addRoot}
          >
            ＋
          </button>
        </div>
        <input
          className="ghost-input border border-line rounded-[8px] px-2 py-1 text-[13px] w-full mb-2"
          name="notes-search"
          aria-label="Поиск по заметкам"
          placeholder="Поиск…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
        />
        {query.trim() ? (
          <NoteSearchResults query={query.trim()} selectedId={selectedId} />
        ) : (
          <>
            {roots.length === 0 && (
              <p className="px-2 py-2 text-[13px] text-dim">
                Пусто. Создай первую заметку кнопкой ＋.
              </p>
            )}
            {roots.map((n) => (
              <NoteNode
                key={n.id}
                note={n}
                depth={0}
                closed={closed}
                toggleOpen={toggleOpen}
                selectedId={selectedId}
              />
            ))}
          </>
        )}
      </div>

      <ColResize
        onDelta={(dx) =>
          setSideW((w) => {
            const nw = Math.min(480, Math.max(200, w + dx));
            try {
              localStorage.setItem(NOTES_W_KEY, String(nw));
            } catch {
              // приватный режим — ширина до перезагрузки
            }
            return nw;
          })
        }
      />

      {selected && !needsMigration ? (
        <NoteEditor key={selected.id} note={selected} />
      ) : (
        <div className="notes-editor panel flex items-center justify-center">
          <p className="text-[13px] text-dim m-0">
            Выбери заметку слева или создай новую.
          </p>
        </div>
      )}
    </div>
  );
}

// Плоский список результатов полнотекстового поиска (по заголовку и телу).
function NoteSearchResults({
  query,
  selectedId,
}: {
  query: string;
  selectedId: number | null;
}) {
  const { notes } = useData();
  const navigate = useNavigate();
  const q = query.toLowerCase();
  const results = [...notes.values()]
    .map((n) => ({ note: n, text: notePlainText(n.body) }))
    .filter(
      ({ note, text }) =>
        note.title.toLowerCase().includes(q) || text.toLowerCase().includes(q),
    )
    .slice(0, 50);
  if (results.length === 0) {
    return <p className="px-2 py-2 text-[13px] text-dim">Ничего не найдено.</p>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {results.map(({ note, text }) => (
        <button
          key={note.id}
          type="button"
          className={`text-left px-2 py-1.5 rounded-[8px] hover:bg-asoft ${
            selectedId === note.id ? "bg-asoft" : ""
          }`}
          onClick={() => navigate(`/notes/${note.id}`)}
        >
          <div className="text-[13.5px] truncate">
            {note.title.trim() === "" ? "Без названия" : note.title}
          </div>
          {text && <div className="mmeta truncate">{snippet(text, query)}</div>}
        </button>
      ))}
    </div>
  );
}

type DropZone = "before" | "into" | "after" | null;

function NoteNode({
  note,
  depth,
  closed,
  toggleOpen,
  selectedId,
}: {
  note: Note;
  depth: number;
  closed: Set<number>;
  toggleOpen: (id: number) => void;
  selectedId: number | null;
}): ReactNode {
  const { notes, createNote, patchNote, removeNote } = useData();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [zone, setZone] = useState<DropZone>(null);

  const kids = noteChildren(notes, note.id);
  const open = !closed.has(note.id);
  const isSel = selectedId === note.id;

  const addChild = async () => {
    if (closed.has(note.id)) toggleOpen(note.id);
    const n = await createNote("", note.id);
    if (n) navigate(`/notes/${n.id}`);
  };

  const computeZone = (e: DragEvent): DropZone => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.25) return "before";
    if (y > 0.75) return "after";
    return "into";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData(NOTE_MIME);
    const dragId = raw ? Number(raw) : null;
    const z = computeZone(e);
    setZone(null);
    if (dragId === null || dragId === note.id) return;
    if (noteSubtreeIds(notes, dragId).includes(note.id)) return; // не в своё поддерево
    if (z === "into") {
      void patchNote(dragId, {
        parentId: note.id,
        position: noteChildren(notes, note.id).length,
      });
      return;
    }
    const sibs = noteChildren(notes, note.parentId).filter(
      (n) => n.id !== dragId,
    );
    const idx = sibs.findIndex((n) => n.id === note.id);
    void patchNote(dragId, {
      parentId: note.parentId,
      position: z === "before" ? idx : idx + 1,
    });
  };

  const zoneCls =
    zone === "into"
      ? "drop-into"
      : zone === "before"
        ? "drop-before"
        : zone === "after"
          ? "drop-after"
          : "";

  return (
    <div>
      <div
        className={`tree-row ${isSel ? "tree-row-sel" : ""} ${zoneCls}`}
        style={{ marginLeft: depth * 14 }}
        draggable={!renaming}
        onClick={() => navigate(`/notes/${note.id}`)}
        onDragStart={(e) => {
          e.dataTransfer.setData(NOTE_MIME, String(note.id));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(NOTE_MIME)) return;
          e.preventDefault();
          e.stopPropagation();
          setZone(computeZone(e));
        }}
        onDragLeave={() => setZone(null)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className={`chevron ${open ? "chevron-open" : ""} ${kids.length === 0 ? "chevron-empty" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleOpen(note.id);
          }}
          aria-label={open ? "Свернуть" : "Развернуть"}
          tabIndex={kids.length === 0 ? -1 : 0}
        >
          ▶
        </button>
        {renaming ? (
          <RenameInput
            initial={note.title}
            onDone={(title) => {
              setRenaming(false);
              if (title !== note.title) void patchNote(note.id, { title });
            }}
          />
        ) : (
          <span
            className={`flex-1 min-w-0 truncate text-[13.5px] ${note.title.trim() === "" ? "text-dim italic" : ""}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
            title={
              note.title.trim() === ""
                ? "Без названия — двойной клик для переименования"
                : note.title
            }
          >
            {note.title.trim() === "" ? "Без названия" : note.title}
          </span>
        )}
        <div className="row-actions">
          <button
            type="button"
            className="row-btn"
            title="Вложенная заметка"
            onClick={(e) => {
              e.stopPropagation();
              void addChild();
            }}
          >
            ＋
          </button>
          <ConfirmButton
            className="row-btn row-btn-danger"
            title="Удалить заметку"
            message={
              kids.length > 0
                ? "Удалить заметку вместе с вложенными?"
                : "Удалить заметку?"
            }
            onConfirm={() => {
              const wasSel =
                selectedId !== null &&
                noteSubtreeIds(notes, note.id).includes(selectedId);
              void removeNote(note.id);
              if (wasSel) navigate("/notes");
            }}
          >
            <TrashIcon />
          </ConfirmButton>
        </div>
      </div>
      {open &&
        kids.map((c) => (
          <NoteNode
            key={c.id}
            note={c}
            depth={depth + 1}
            closed={closed}
            toggleOpen={toggleOpen}
            selectedId={selectedId}
          />
        ))}
    </div>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="ghost-input flex-1 text-[13.5px]"
      name="note-title"
      aria-label="Название заметки"
      value={value}
      autoFocus
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value.trim());
        if (e.key === "Escape") onDone(initial);
      }}
    />
  );
}
