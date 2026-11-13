import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ProjectsPage } from "./projects/ProjectsPage";

const ProjectPage = lazy(() => import("./project/ProjectPage").then((m) => ({ default: m.ProjectPage })));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Opening project…</p>}>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/p/:projectId" element={<ProjectPage />} />
          <Route path="*" element={<ProjectsPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
