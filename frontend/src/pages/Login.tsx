import { useState } from "react";
import { supabase } from "../supabase";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            className="field"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
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
