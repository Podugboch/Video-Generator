import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Layout from "./Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import ProjectPage from "./pages/Project";

export default function App() {
  // undefined = still checking, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/p/:id" element={<ProjectPage />} />
      </Route>
    </Routes>
  );
}
