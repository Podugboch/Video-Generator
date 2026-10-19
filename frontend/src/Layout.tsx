import { useEffect, useState } from "react";
import { Link, Outlet, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, naira } from "./api";
import { supabase } from "./supabase";

export default function Layout() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [showPacks, setShowPacks] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

  // Paystack sends people back to "/?reference=..." after paying.
  useEffect(() => {
    const reference = params.get("reference");
    if (!reference) return;
    api
      .verify(reference)
      .catch(() => undefined)
      .finally(() => {
        qc.invalidateQueries({ queryKey: ["me"] });
        setParams({}, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = useMutation({
    mutationFn: api.checkout,
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    qc.clear();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-2xl font-bold">
            <span className="inline-block h-5 w-5 rounded-sm bg-reel" aria-hidden />
            Reel
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <button
              className="btn btn-quiet !py-1.5"
              onClick={() => setShowPacks((v) => !v)}
              aria-expanded={showPacks}
            >
              {me.data ? `${me.data.credits} credits` : "Credits"}
            </button>
            <button className="text-slate underline underline-offset-2 hover:text-ink" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {showPacks && me.data && (
          <div className="border-t border-line bg-mist">
            <div className="mx-auto max-w-5xl px-5 py-5">
              <p className="mb-3 max-w-prose text-slate">
                A video costs {me.data.storyboard_cost + me.data.render_cost} credits:{" "}
                {me.data.storyboard_cost} for the storyboard and {me.data.render_cost} to make the video.
              </p>
              <div className="flex flex-wrap gap-3">
                {me.data.packs.map((p) => (
                  <button
                    key={p.id}
                    className="btn btn-primary"
                    disabled={buy.isPending}
                    onClick={() => buy.mutate(p.id)}
                  >
                    {p.credits} credits for {naira(p.amount_kobo)}
                  </button>
                ))}
              </div>
              {buy.isError && <p className="mt-3 text-danger">{(buy.error as Error).message}</p>}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <Outlet />
      </main>
    </div>
  );
}
