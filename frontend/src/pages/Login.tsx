import { useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabase";

export default function Login({ onDemoLogin }: { onDemoLogin?: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError(
        "Supabase credentials are not configured yet. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Render static site environment variables, or click 'Explore UI in Demo Mode' below.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Check your email and click the confirmation link, then sign in.");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <div className="mb-8 flex items-center gap-2 font-display text-4xl font-bold">
        <span className="inline-block h-7 w-7 rounded-sm bg-reel" aria-hidden />
        Reel
      </div>
      <h1 className="mb-1 font-display text-2xl font-bold">Turn a topic into a 30-second video</h1>
      <p className="mb-6 text-slate">Create an account and get enough free credits for your first video.</p>

      {!isSupabaseConfigured && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 shadow-xs">
          <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-950">
            <span>⚙️</span>
            <span>Supabase Connection Needed</span>
          </div>
          <p className="leading-relaxed text-amber-800">
            To sign up and save projects, configure <code className="rounded bg-amber-200/60 px-1 py-0.5 font-mono text-[11px]">VITE_SUPABASE_URL</code> and <code className="rounded bg-amber-200/60 px-1 py-0.5 font-mono text-[11px]">VITE_SUPABASE_ANON_KEY</code> in Render environment variables.
          </p>
          {onDemoLogin && (
            <button
              type="button"
              onClick={onDemoLogin}
              className="mt-2.5 inline-block font-bold text-amber-900 underline underline-offset-2 hover:text-black cursor-pointer"
            >
              Preview App (Demo Mode) →
            </button>
          )}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <div className="relative">
            <input
              className="field !pr-10"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate hover:text-ink cursor-pointer focus:outline-hidden"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
        </label>
        {error && <p className="text-danger">{error}</p>}
        {notice && <p className="text-teal">{notice}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        className="mt-4 text-left text-slate underline underline-offset-2 hover:text-ink"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError("");
          setNotice("");
        }}
      >
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
