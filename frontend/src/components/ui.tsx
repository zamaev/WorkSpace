import type { MouseEvent, ReactNode } from "react";

// Метка mono caps: «ДЕРЕВО», «ПРОСРОЧЕНО».
export function MLabel({
  children,
  accent,
  className = "",
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return <div className={`mlabel ${accent ? "mlabel-accent" : ""} ${className}`}>{children}</div>;
}

// Вертикальная полоска-маркёр цвета проекта.
export function SBar({ color }: { color: string }) {
  return <span className="sbar" style={{ background: color }} aria-hidden="true" />;
}

// Точка-маркёр цвета проекта.
export function SDot({ color }: { color: string }) {
  return <span className="sdot" style={{ background: color }} aria-hidden="true" />;
}

// Чекбокс задачи: off / done.
export function Check({
  size = "md",
  done,
  label,
  onClick,
}: {
  size?: "md" | "sm";
  done: boolean;
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const cls = ["check", size === "sm" ? "check-sm" : "", done ? "check-on" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} aria-label={label} aria-pressed={done} onClick={onClick}>
      {done ? "✓" : null}
    </button>
  );
}
