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

// Штриховая корзина в духе языка (наследует currentColor).
export function TrashIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.5 3.5h11M5.5 1.5h3M3 3.5l.7 8.2c.05.6.55 1.05 1.15 1.05h4.3c.6 0 1.1-.45 1.15-1.05l.7-8.2M5.6 6v4M8.4 6v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Инициалы: до двух букв по словам имени («Пётр Иванов» → ПИ).
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Кружок-инициалы человека.
export function AvatarDot({ name, color, size = 18 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white flex-none"
      style={{ width: size, height: size, background: color, fontSize: size * 0.44 }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
