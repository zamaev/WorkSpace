import { useEffect, useRef, useState } from "react";
import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

// Языки для селектора у блока кода. "mermaid" рендерит диаграмму.
const LANGS: { value: string; label: string }[] = [
  { value: "", label: "текст" },
  { value: "mermaid", label: "mermaid" },
  { value: "javascript", label: "javascript" },
  { value: "typescript", label: "typescript" },
  { value: "go", label: "go" },
  { value: "python", label: "python" },
  { value: "sql", label: "sql" },
  { value: "bash", label: "bash" },
  { value: "json", label: "json" },
];

let renderSeq = 0;

// CodeBlock с React-NodeView: селектор языка + редактируемый код; при
// языке "mermaid" под кодом — живая диаграмма (перерисовывается при
// правке, с debounce). Сам mermaid грузится лениво, чтобы не утяжелять
// основной бандл заметками без диаграмм.
export const MermaidCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const code = node.textContent;
  const isMermaid = language === "mermaid";
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isMermaid || code.trim() === "") {
      setSvg("");
      setError("");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.dataset.theme === "light" ? false : true;
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          securityLevel: "strict", // санитизирует вывод — защита от XSS в диаграмме
        });
        const id = `mmd-${++renderSeq}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(svg);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setSvg("");
          setError(e instanceof Error ? e.message : "не удалось построить диаграмму");
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, isMermaid]);

  return (
    <NodeViewWrapper className="code-block">
      <div className="code-block-head" contentEditable={false}>
        <select
          className="code-lang"
          name="code-language"
          aria-label="Язык блока кода"
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
        >
          {LANGS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {isMermaid && (svg || error) && (
        <MermaidView svg={svg} error={error} />
      )}
    </NodeViewWrapper>
  );
}

function MermaidView({ svg, error }: { svg: string; error: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // безопасно: mermaid с securityLevel "strict" санитизирует SVG; ставим
  // через ref, чтобы не пересобирать DOM редактора
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = svg;
  }, [svg]);
  if (error) {
    return (
      <div className="mermaid-error" contentEditable={false}>
        Ошибка mermaid: {error}
      </div>
    );
  }
  return <div className="mermaid-render" contentEditable={false} ref={ref} />;
}
