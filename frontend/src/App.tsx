import { useEffect, useState, Component, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";
import Layout from "./Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import ProjectPage from "./pages/Project";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 text-center">
          <h2 className="mb-2 font-display text-2xl font-bold text-danger">Something went wrong</h2>
          <p className="mb-4 text-sm text-slate">{this.state.error.message || "An unexpected error occurred."}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // undefined = still checking, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      return;
    }

    let isMounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isMounted) setSession(data.session);
      })
      .catch((err) => {
        console.warn("Auth check error:", err);
        if (isMounted) setSession(null);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (isMounted) setSession(s);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate/20 border-t-reel" />
          <p className="mt-3 font-medium text-slate">Loading Reel…</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {!session ? (
        <Login
          onDemoLogin={() =>
            setSession({
              user: { id: "demo-user", email: "demo@videogen.local" },
              access_token: "demo",
            } as unknown as Session)
          }
        />
      ) : (
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/p/:id" element={<ProjectPage />} />
          </Route>
        </Routes>
      )}
    </ErrorBoundary>
  );
}
