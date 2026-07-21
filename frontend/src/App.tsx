import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { DataProvider } from "./data/DataProvider";
import { ProjectsView } from "./tree/ProjectsView";
import { WeekView } from "./week/WeekView";
import { GanttView } from "./gantt/GanttView";

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects/:pid?" element={<ProjectsView />} />
            <Route path="/week/:date?" element={<WeekView />} />
            <Route path="/gantt" element={<GanttView />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </Shell>
      </DataProvider>
    </BrowserRouter>
  );
}
