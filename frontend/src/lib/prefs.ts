// Общие localStorage-ключи и помощники настроек интерфейса.

export const WEEKENDS_KEY = "workspace-hide-weekends";
export const TWO_WEEKS_KEY = "workspace-two-weeks";
export const FILTER_ASSIGNEE_KEY = "workspace-filter-assignee";
export const FILTER_TYPE_KEY = "workspace-filter-type";
export const HIDE_DONE_KEY = "workspace-hide-done";
export const SELECTED_TASK_KEY = "workspace-selected-task";

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // приватный режим — настройка не переживёт перезагрузку
  }
}
