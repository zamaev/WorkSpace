import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { useData } from "../data/DataProvider";
import type { Note } from "../data/types";
import { MermaidCodeBlock } from "./MermaidCodeBlock";

// WYSIWYG-редактор заметки в духе Outline: пишешь и сразу видишь. Тело
// хранится как HTML — родной формат редактора: пустые абзацы и любое
// форматирование сохраняются без потерь (markdown схлопывал пустые
// строки при round-trip). Существующие markdown-заметки переводятся в
// HTML миграцией в NotesView. Горячие клавиши (⌘B/⌘I/…), markdown-
// подсказки на лету (# , **, - , > ), вставка URL поверх выделения →
// ссылка — из коробки StarterKit + Link.
export function NoteEditor({ note }: { note: Note }) {
  const { patchNote } = useData();
  const [title, setTitle] = useState(note.title);

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

  const saveTitle = (v: string) => {
    if (v !== note.title) void patchNote(note.id, { title: v });
  };

  return (
    <div className="notes-editor panel px-6 py-5">
      <div className="note-doc">
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
          // ⌘/Ctrl-клик по ссылке — открыть в новой вкладке
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
      <span className="note-tool-sep" />
      {btn("🔗", editor.isActive("link"), () => promptLink(editor), "Ссылка ⌘K")}
    </div>
  );
}
