import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { DataProvider } from "./data/DataProvider";
import { ProjectsView } from "./tree/ProjectsView";
import { WeekView } from "./week/WeekView";
import { GanttView } from "./gantt/GanttView";
import { TeamView } from "./team/TeamView";
import { TypesView } from "./types/TypesView";

// заметки тянут тяжёлый редактор (tiptap + lowlight + highlight.js, mermaid
// лениво отдельно) — грузим их чанк только при заходе в раздел
const NotesView = lazy(() =>
  import("./notes/NotesView").then((m) => ({ default: m.NotesView })),
);

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Shell>
          <Suspense
            fallback={
              <p className="panel px-6 py-8 text-[13px] text-dim">Загрузка…</p>
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects/:pid?" element={<ProjectsView />} />
              <Route path="/week/:date?" element={<WeekView />} />
              <Route path="/gantt" element={<GanttView />} />
              <Route path="/team" element={<TeamView />} />
              <Route path="/types" element={<TypesView />} />
              <Route path="/notes/:id?" element={<NotesView />} />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </Suspense>
        </Shell>
      </DataProvider>
    </BrowserRouter>
  );
}
