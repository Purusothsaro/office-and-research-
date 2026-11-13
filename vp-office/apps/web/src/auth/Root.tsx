import { HttpRepository, IndexedDbRepository, session, type SessionUser } from "@octo/storage";
import { useEffect, useMemo, useState } from "react";
import { App } from "../App";
import { Button } from "../components/Dialog";

export function SignIn({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(mode === "login" ? await session.login(email, password) : await session.register(email, password, name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100";
  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm" aria-labelledby="signin-title">
        <div className="flex items-center gap-2">
          <img src="/og-logo.png" alt="" className="size-9 rounded-md object-contain" />
          <span className="font-semibold text-brand-700">
            OctoGenie <span className="font-normal text-slate-500">Office</span>
          </span>
        </div>
        <h1 id="signin-title" className="text-xl font-semibold text-slate-900">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h1>
        {mode === "register" && (
          <label className="block text-sm font-medium text-slate-800">
            Name
            <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="block text-sm font-medium text-slate-800">
          Email
          <input className={`${input} mt-1`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Password
          <input
            className={`${input} mt-1`}
            type="password"
            required
            minLength={mode === "register" ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "register" && <span className="mt-1 block text-xs font-normal text-slate-500">At least 10 characters.</span>}
        </label>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy} className="w-full">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        <p className="text-center text-sm text-slate-600">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => (setMode(mode === "login" ? "register" : "login"), setError(null))}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </main>
  );
}

/** Offers to move files saved in this browser (before server storage) into the account. */
export function BrowserImport({ repository }: { repository: HttpRepository }) {
  const [count, setCount] = useState(0);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const local = useMemo(() => (typeof indexedDB === "undefined" ? null : new IndexedDbRepository()), []);
  useEffect(() => {
    void local?.list().then((files) => setCount(files.length), () => setCount(0));
    return () => local?.close();
  }, [local]);
  if (!local || count === 0 || state === "done") return null;
  const run = async () => {
    setState("busy");
    const files = await local.list();
    for (const f of files) {
      try {
        await repository.create({ name: f.name, format: f.format, bytes: await local.getContent(f.id), ...(f.templateId ? { templateId: f.templateId } : {}) });
        await local.delete(f.id);
      } catch {
        // Leave anything that failed in the browser so it can be retried.
      }
    }
    const left = (await local.list()).length;
    setCount(left);
    setState(left ? "idle" : "done");
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
      <span className="mr-auto">
        {count} {count === 1 ? "file is" : "files are"} still stored only in this browser. Import {count === 1 ? "it" : "them"} into your account so {count === 1 ? "it's" : "they're"} saved on the server.
      </span>
      <Button variant="primary" disabled={state === "busy"} onClick={() => void run()}>
        {state === "busy" ? "Importing…" : "Import"}
      </Button>
    </div>
  );
}

export function Root() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const repository = useMemo(() => new HttpRepository(), []);
  useEffect(() => {
    repository.onAuthRequired = () => setUser(null);
    session.me().then(setUser, () => setUser(null));
  }, [repository]);
  if (user === undefined) return <p className="p-8 text-sm text-slate-500">Loading…</p>;
  if (user === null) return <SignIn onSignedIn={setUser} />;
  return (
    <div className="flex h-full flex-col">
      <BrowserImport repository={repository} />
      <div className="min-h-0 flex-1">
        <App
          repository={repository}
          user={user}
          onSignOut={async () => {
            await session.logout();
            repository.close();
            setUser(null);
          }}
        />
      </div>
    </div>
  );
}
