import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Status } from "../api";
import Corners from "../Corners";

const EXAMPLES = [
  "Why prices keep rising",
  "How vaccines train your immune system",
  "Why we dream",
  "How a bank makes money from your deposit",
];

export const STATUS_LABEL: Record<Status, string> = {
  draft: "Storyboard",
  queued: "In queue",
  rendering: "Making video",
  done: "Ready",
  failed: "Failed",
};

export default function Home() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [topic, setTopic] = useState("");
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });

  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      nav(`/p/${project.id}`);
    },
  });

  const cost = me.data?.storyboard_cost ?? 1;

  return (
    <div className="space-y-14">
      <section>
        <h1 className="mb-6 max-w-2xl font-display text-4xl font-bold leading-tight sm:text-5xl">
          What should your video explain?
        </h1>

        <form
          className="relative max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (topic.trim().length >= 3) create.mutate(topic.trim());
          }}
        >
          <div className="relative bg-white p-1">
            <Corners />
            <textarea
              className="block aspect-[16/6] w-full resize-none bg-white p-4 font-display text-xl outline-none placeholder:text-slate/60"
              placeholder="Type a topic or describe the video you want…"
              maxLength={300}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              aria-label="Video topic"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={create.isPending || topic.trim().length < 3}>
              {create.isPending ? "Writing storyboard…" : `Write storyboard · ${cost} credit`}
            </button>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="btn btn-quiet !py-1.5 text-sm font-medium"
                onClick={() => setTopic(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
          {create.isError && <p className="mt-3 text-danger">{(create.error as Error).message}</p>}
        </form>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">Your videos</h2>
        {projects.isLoading && <p className="text-slate">Loading…</p>}
        {projects.data?.length === 0 && (
          <p className="text-slate">Nothing here yet. Write your first storyboard above.</p>
        )}
        <ul className="divide-y divide-line border-y border-line">
          {projects.data?.map((p) => (
            <li key={p.id}>
              <Link to={`/p/${p.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-white/60">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.title ?? p.topic}</span>
                  <span className="block text-sm text-slate">{new Date(p.created_at).toLocaleDateString()}</span>
                </span>
                <span
                  className={`shrink-0 text-sm font-medium ${
                    p.status === "done" ? "text-teal" : p.status === "failed" ? "text-danger" : "text-slate"
                  }`}
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
