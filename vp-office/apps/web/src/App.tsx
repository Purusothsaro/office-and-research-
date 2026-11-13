import type { DocumentRepository, SessionUser } from "@octo/storage";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/Toasts";
import { EditorPage } from "./editor/EditorPage";
import { HomePage } from "./home/HomePage";
import { RepositoryProvider, SessionProvider } from "./lib/repository";

interface AppProps {
  repository: DocumentRepository;
  /** Tests pass an initial path to use an in-memory router. */
  initialPath?: string;
  user?: SessionUser;
  onSignOut?: () => void;
}

export function App({ repository, initialPath, user, onSignOut }: AppProps) {
  const routes = (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/edit/:id" element={<EditorPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
  return (
    <SessionProvider user={user ?? null} onSignOut={onSignOut ?? null}>
    <RepositoryProvider repository={repository}>
      <ToastProvider>
        {initialPath ? <MemoryRouter initialEntries={[initialPath]}>{routes}</MemoryRouter> : <BrowserRouter>{routes}</BrowserRouter>}
      </ToastProvider>
    </RepositoryProvider>
    </SessionProvider>
  );
}
