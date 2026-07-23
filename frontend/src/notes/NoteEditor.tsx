import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { useData } from "../data/DataProvider";
import { noteAncestors } from "../data/selectors";
import type { Note } from "../data/types";
import { MermaidCodeBlock } from "./MermaidCodeBlock";
import { WikiLink } from "./WikiLink";

type TocItem = { level: number; text: string; index: number };

// WYSIWYG-редактор заметки в духе Outline: пишешь и сразу видишь. Тело
// хранится как HTML — родной формат редактора: пустые абзацы и любое
// форматирование сохраняются без потерь (markdown схлопывал пустые
// строки при round-trip). Существующие markdown-заметки переводятся в
// HTML миграцией в NotesView. Горячие клавиши (⌘B/⌘I/…), markdown-
// подсказки на лету (# , **, - , > ), вставка URL поверх выделения →
// ссылка — из коробки StarterKit + Link.
export function NoteEditor({ note }: { note: Note }) {
  const { patchNote, notes } = useData();
  const navigate = useNavigate();
  const [title, setTitle] = useState(note.title);
  const path = noteAncestors(notes, note.id);
  const [toc, setToc] = useState<TocItem[]>([]);

  // актуальный список заметок для автокомплита wiki-ссылок (редактор создаётся
  // один раз — читаем через ref, чтобы видеть свежие заметки)
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const fn = pending.current;
    pending.current = null;
    if (fn) fn();
  };
  const debounced = (fn: () => void) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pending.current = fn;
    saveTimer.current = setTimeout(() => {
      pending.current = null;
      fn();
    }, 700);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, codeBlock: false }),
      MermaidCodeBlock,
      TaskList,
      TaskItem.configure({ nested: true }),
      WikiLink.configure({
        getNotes: () => [...notesRef.current.values()],
      }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({
        placeholder:
          "Пиши здесь… # заголовок, **жирный**, - список, > цитата, ```mermaid — диаграмма",
      }),
      Link.configure({
        openOnClick: false, // в редакторе клик ставит курсор; открыть — ⌘/Ctrl+клик
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
          title: "⌘/Ctrl-клик — открыть",
        },
      }),
    ],
    content: note.body,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      debounced(() => {
        if (html !== note.body) void patchNote(note.id, { body: html });
      });
    },
  });

  // размонтирование (смена заметки — компонент с key={id}) доигрывает
  // отложенное сохранение, чтобы не потерять последние символы
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  // оглавление из заголовков тела; пересчитывается при правках. Доступ к
  // view.dom в tiptap v3 бросает до монтирования — ждём событие create и
  // страхуемся try/catch
  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      if (editor.isDestroyed) return;
      let dom: HTMLElement;
      try {
        dom = editor.view.dom as HTMLElement;
      } catch {
        return; // view ещё не смонтирован
      }
      const hs = [...dom.querySelectorAll("h1, h2, h3")].map(
        (h, i): TocItem => ({
          level: Number(h.tagName[1]),
          text: h.textContent ?? "",
          index: i,
        }),
      );
      setToc(hs);
    };
    editor.on("create", compute);
    editor.on("update", compute);
    compute();
    return () => {
      editor.off("create", compute);
      editor.off("update", compute);
    };
  }, [editor]);

  const scrollToHeading = (index: number) => {
    if (!editor) return;
    try {
      const els = editor.view.dom.querySelectorAll("h1, h2, h3");
      els[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // view недоступен — молча пропускаем
    }
  };

  const saveTitle = (v: string) => {
    if (v !== note.title) void patchNote(note.id, { title: v });
  };

  return (
    <div className="notes-editor note-editor-wide panel px-6 py-5">
      <div className="note-doc">
      {path.length > 0 && (
        <nav className="note-crumbs" aria-label="Путь">
          {path.map((p) => (
            <button
              key={p.id}
              type="button"
              className="note-crumb"
              onClick={() => navigate(`/notes/${p.id}`)}
            >
              {p.title.trim() === "" ? "Без названия" : p.title}
            </button>
          ))}
        </nav>
      )}
      <input
        className="ghost-input text-[22px] font-semibold pb-2"
        name="note-title-main"
        aria-label="Заголовок заметки"
        placeholder="Без названия"
        value={title}
        onChange={(e) => {
          const v = e.target.value;
          setTitle(v);
          debounced(() => saveTitle(v));
        }}
        onBlur={() => {
          flush();
          saveTitle(title);
        }}
        onKeyDown={(e) => {
          // Enter в заголовке — уводим фокус в тело
          if (e.key === "Enter") {
            e.preventDefault();
            editor?.chain().focus().run();
          }
        }}
      />
      {editor && <Toolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="note-editor-body"
        onKeyDownCapture={(e) => {
          // ⌘K / Ctrl+K — вставить/править ссылку на выделении
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            if (editor) promptLink(editor);
          }
        }}
        onClickCapture={(e) => {
          // клик по wiki-ссылке — переход к заметке внутри приложения
          const wiki = (e.target as HTMLElement).closest("[data-wikilink]");
          if (wiki) {
            e.preventDefault();
            const nid = wiki.getAttribute("data-wikilink");
            if (nid) navigate(`/notes/${nid}`);
            return;
          }
          // ⌘/Ctrl-клик по обычной ссылке — открыть в новой вкладке
          if (!(e.metaKey || e.ctrlKey)) return;
          const a = (e.target as HTMLElement).closest("a");
          const href = a?.getAttribute("href");
          if (href) {
            e.preventDefault();
            window.open(href, "_blank", "noopener,noreferrer");
          }
        }}
      />
      </div>
      {toc.length > 1 && (
        <nav className="note-toc" aria-label="Оглавление">
          <div className="mlabel pb-1.5">Оглавление</div>
          {toc.map((h) => (
            <button
              key={h.index}
              type="button"
              className="note-toc-item"
              style={{ paddingLeft: (h.level - 1) * 10 }}
              onClick={() => scrollToHeading(h.index)}
              title={h.text}
            >
              {h.text}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function promptLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Адрес ссылки", prev ?? "https://");
  if (url === null) return;
  if (url.trim() === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor
    .chain()
    .focus()
    .extendMarkRange("link")
    .setLink({ href: url.trim() })
    .run();
}

function Toolbar({ editor }: { editor: Editor }) {
  // подписка на изменения выделения/состояния для подсветки активных кнопок
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  const btn = (
    label: string,
    active: boolean,
    onClick: () => void,
    title: string,
  ) => (
    <button
      type="button"
      className={`note-tool ${active ? "note-tool-on" : ""}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()} // не терять выделение
      onClick={onClick}
    >
      {label}
    </button>
  );

  const c = () => editor.chain().focus();
  return (
    <div className="note-toolbar">
      {btn("Ж", editor.isActive("bold"), () => c().toggleBold().run(), "Жирный ⌘B")}
      {btn(
        "К",
        editor.isActive("italic"),
        () => c().toggleItalic().run(),
        "Курсив ⌘I",
      )}
      {btn(
        "S",
        editor.isActive("strike"),
        () => c().toggleStrike().run(),
        "Зачёркнутый",
      )}
      <span className="note-tool-sep" />
      {btn(
        "H1",
        editor.isActive("heading", { level: 1 }),
        () => c().toggleHeading({ level: 1 }).run(),
        "Заголовок 1",
      )}
      {btn(
        "H2",
        editor.isActive("heading", { level: 2 }),
        () => c().toggleHeading({ level: 2 }).run(),
        "Заголовок 2",
      )}
      {btn(
        "H3",
        editor.isActive("heading", { level: 3 }),
        () => c().toggleHeading({ level: 3 }).run(),
        "Заголовок 3",
      )}
      <span className="note-tool-sep" />
      {btn(
        "•",
        editor.isActive("bulletList"),
        () => c().toggleBulletList().run(),
        "Маркированный список",
      )}
      {btn(
        "1.",
        editor.isActive("orderedList"),
        () => c().toggleOrderedList().run(),
        "Нумерованный список",
      )}
      {btn(
        "☑",
        editor.isActive("taskList"),
        () => c().toggleTaskList().run(),
        "Чек-лист",
      )}
      {btn(
        "❝",
        editor.isActive("blockquote"),
        () => c().toggleBlockquote().run(),
        "Цитата",
      )}
      {btn(
        "</>",
        editor.isActive("codeBlock"),
        () => c().toggleCodeBlock().run(),
        "Блок кода",
      )}
      {btn(
        "⊞",
        editor.isActive("table"),
        () =>
          c()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
        "Вставить таблицу",
      )}
      <span className="note-tool-sep" />
      {btn("🔗", editor.isActive("link"), () => promptLink(editor), "Ссылка ⌘K")}
      {editor.isActive("table") && (
        <>
          <span className="note-tool-sep" />
          {btn("стлб+", false, () => c().addColumnAfter().run(), "Столбец справа")}
          {btn("стлб−", false, () => c().deleteColumn().run(), "Удалить столбец")}
          {btn("стр+", false, () => c().addRowAfter().run(), "Строка ниже")}
          {btn("стр−", false, () => c().deleteRow().run(), "Удалить строку")}
          {btn("✕", false, () => c().deleteTable().run(), "Удалить таблицу")}
        </>
      )}
    </div>
  );
}
