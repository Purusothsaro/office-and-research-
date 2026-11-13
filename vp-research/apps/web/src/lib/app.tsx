import { LocalStore, ResearchApi } from "@octo/research";
import type { SessionUser } from "./session";
import { createContext, useContext } from "react";

export interface AppServices {
  api: ResearchApi;
  local: LocalStore;
  user: SessionUser;
  signOut: () => void;
}

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppContext missing");
  return ctx;
}

/** Triggers a download of bytes produced in the browser. */
export function download(bytes: Uint8Array | string, name: string, mime: string) {
  const blob = new Blob([typeof bytes === "string" ? bytes : (bytes as BlobPart)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file-system-safe version of a name. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "export";
