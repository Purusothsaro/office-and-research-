import { LocalStore, ResearchApi } from "@octo/research";
import { session, type SessionUser } from "../lib/session";
import { useEffect, useMemo, useState } from "react";
import { App } from "../App";
import { Button, inputClass } from "../components/ui";
import { AppContext } from "../lib/app";

const LOGO = `${import.meta.env.BASE_URL}og-logo.png`;

export function Brand({ dark }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <img src={LOGO} alt="" className="size-8 rounded-md object-contain" />
      <span className={`text-[15px] font-semibold tracking-tight ${dark ? "text-white" : "text-ink-900"}`}>
        OctoGenie <span className={dark ? "font-normal text-brand-200" : "font-normal text-brand-600"}>Research</span>
      </span>
    </span>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
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
  return (
    <main className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink-900 p-10 text-slate-200 lg:flex">
        <Brand dark />
        <div className="max-w-md space-y-4">
          <h1 className="font-serif text-3xl leading-tight text-white">Read, connect and cite across every document in the case.</h1>
          <p className="text-[15px] leading-relaxed text-slate-300">Pull passages out of depositions, contracts and correspondence onto a workspace, link what supports or contradicts what, and turn it into a cited summary. Every excerpt keeps its page reference.</p>
        </div>
        <p className="text-xs text-slate-400">Documents stay private to your account. OCR runs in your browser.</p>
      </section>
      <section className="flex items-center justify-center bg-slate-50 p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4" aria-labelledby="signin-title">
          <div className="lg:hidden">
            <Brand />
          </div>
          <h1 id="signin-title" className="text-xl font-semibold text-slate-900">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-sm text-slate-600">Your OctoGenie Research account.</p>
          {mode === "register" && (
            <label className="block text-sm font-medium text-slate-800">
              Name
              <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium text-slate-800">
            Email
            <input className={`${inputClass} mt-1`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Password
            <input className={`${inputClass} mt-1`} type="password" required minLength={mode === "register" ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <Button variant="primary" type="submit" disabled={busy} className="h-9 w-full">
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
          <p className="text-center text-sm text-slate-600">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => (setMode(mode === "login" ? "register" : "login"), setError(null))}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}

export function Root() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    session
      .me()
      .then(setUser)
      .catch((e: { status?: number; message?: string }) => {
        if (e.status && e.status !== 401) setError(e.message ?? "Can't reach the server.");
        setUser(null);
      });
  }, []);
  const services = useMemo(() => {
    if (!user) return null;
    const api = new ResearchApi();
    api.onAuthRequired = () => setUser(null);
    return {
      api,
      local: new LocalStore(user.id),
      user,
      signOut: () => void session.logout().then(() => setUser(null)),
    };
  }, [user]);
  if (user === undefined) return <p className="p-8 text-sm text-slate-500">Loading…</p>;
  if (!services)
    return (
      <>
        {error && (
          <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <SignIn onSignedIn={setUser} />
      </>
    );
  return (
    <AppContext.Provider value={services}>
      <App />
    </AppContext.Provider>
  );
}
