import { Node, mergeAttributes } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { Note } from "../data/types";

export interface WikiLinkOptions {
  getNotes: () => Note[];
}

type Item = { id: number; title: string };

// Императивный поповер автокомплита (без React/tippy — самодостаточно).
function makePopupRenderer() {
  return () => {
    let el: HTMLDivElement | null = null;
    let items: Item[] = [];
    let selected = 0;
    let command: (item: Item) => void = () => {};

    const paint = () => {
      if (!el) return;
      el.innerHTML = "";
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "wiki-popup-empty";
        empty.textContent = "Нет заметок";
        el.appendChild(empty);
        return;
      }
      items.forEach((it, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "wiki-popup-item" + (i === selected ? " is-sel" : "");
        b.textContent = it.title;
        b.addEventListener("mousedown", (e) => {
          e.preventDefault();
          command(it);
        });
        el!.appendChild(b);
      });
    };

    const place = (rect: DOMRect | null | undefined) => {
      if (!el || !rect) return;
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.bottom + 4}px`;
    };

    return {
      onStart: (props: {
        items: Item[];
        command: (item: Item) => void;
        clientRect?: (() => DOMRect | null) | null;
      }) => {
        el = document.createElement("div");
        el.className = "wiki-popup";
        document.body.appendChild(el);
        items = props.items;
        command = props.command;
        selected = 0;
        place(props.clientRect?.());
        paint();
      },
      onUpdate: (props: {
        items: Item[];
        command: (item: Item) => void;
        clientRect?: (() => DOMRect | null) | null;
      }) => {
        items = props.items;
        command = props.command;
        selected = 0;
        place(props.clientRect?.());
        paint();
      },
      onKeyDown: (props: { event: KeyboardEvent }) => {
        const k = props.event.key;
        const n = Math.max(items.length, 1);
        if (k === "ArrowDown") {
          selected = (selected + 1) % n;
          paint();
          return true;
        }
        if (k === "ArrowUp") {
          selected = (selected - 1 + n) % n;
          paint();
          return true;
        }
        if (k === "Enter") {
          if (items[selected]) command(items[selected]);
          return true;
        }
        if (k === "Escape") return true;
        return false;
      },
      onExit: () => {
        el?.remove();
        el = null;
      },
    };
  };
}

// Инлайн-нода ссылки на другую заметку. Вставляется автокомплитом по «[[».
export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addOptions() {
    return { getNotes: () => [] };
  },

  addAttributes() {
    return {
      // noteId читаем из data-wikilink, чтобы ссылки переживали сохранение/
      // перезагрузку (HTML → нода → HTML)
      noteId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-wikilink"),
        renderHTML: (attrs) =>
          attrs.noteId != null ? { "data-wikilink": String(attrs.noteId) } : {},
      },
      // label — текст самой ссылки
      label: {
        default: "",
        parseHTML: (el) => el.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  // span, не <a> — иначе конфликтует с Link-расширением (оба ловят <a>),
  // и Link перезаписывал бы data-wikilink
  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "wiki-link",
        role: "link",
        tabindex: "0",
      }),
      String(node.attrs.label ?? ""),
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.label}]]`;
  },

  addProseMirrorPlugins() {
    const getNotes = this.options.getNotes;
    return [
      Suggestion<Item>({
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        startOfLine: false,
        items: ({ query }) => {
          const q = query.trim().toLowerCase();
          return getNotes()
            .filter((n) => (n.title || "").toLowerCase().includes(q))
            .slice(0, 8)
            .map((n) => ({
              id: n.id,
              title: n.title.trim() || "Без названия",
            }));
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: "wikiLink",
                attrs: { noteId: props.id, label: props.title },
              },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: makePopupRenderer(),
      }),
    ];
  },
});
