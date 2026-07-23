import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

// Разовая миграция тела заметки markdown → HTML: заметки, созданные до
// перехода на HTML-хранение, конвертируются через headless-редактор с
// markdown-парсером. После конвертации тело — HTML, и функция больше не
// трогает такие заметки (см. looksLikeHtml).
export function looksLikeHtml(body: string): boolean {
  return /^\s*</.test(body);
}

export function markdownToHtml(md: string): string {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
    ],
    content: md,
  });
  const html = editor.getHTML();
  editor.destroy();
  return html;
}
