import type { TaskType } from "../data/types";

// Бейдж типа: эмодзи (имя в тултипе); без эмодзи — первые буквы mono-caps.
export function TypeBadge({ type, size = 14 }: { type: TaskType; size?: number }) {
  if (type.emoji) {
    return (
      <span title={type.name} aria-label={type.name} style={{ fontSize: size, lineHeight: 1 }} className="flex-none">
        {type.emoji}
      </span>
    );
  }
  return (
    <span className="mlabel !opacity-70 whitespace-nowrap flex-none" title={type.name}>
      {type.name.slice(0, 2)}
    </span>
  );
}
