import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Scene } from "../api";
import Corners from "../Corners";

const STAGE_TEXT: Record<string, string> = {
  assets: "Drawing the scenes and recording the narration…",
  video: "Putting the video together…",
};

export default function ProjectPage() {
  const { id } = useParams() as { id: string };
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.project(id),
    refetchInterval: (q) =>
      q.state.data && ["queued", "rendering"].includes(q.state.data.status) ? 3000 : false,
  });

  const p = project.data;
  const busy = p?.status === "queued" || p?.status === "rendering";

  // When a render finishes (or fails and refunds), refresh credits and the list.
  useEffect(() => {
    if (p?.status === "done" || p?.status === "failed") {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    }
  }, [p?.status, qc]);

  const render = useMutation({
    mutationFn: () => api.render(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  if (project.isLoading) return <p className="text-slate">Loading…</p>;
  if (project.isError || !p) return <p className="text-danger">We couldn't find this project.</p>;

  const renderCost = me.data?.render_cost ?? 5;
  const filename = (p.title ?? "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="space-y-10">
      <div>
        <Link to="/" className="text-sm text-slate underline underline-offset-2 hover:text-ink">
          All videos
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{p.title ?? p.topic}</h1>
      </div>

      {p.final_video_url && (
        <section>
          <div className="relative max-w-3xl bg-ink p-1">
            <Corners />
            <video className="aspect-video w-full bg-ink" controls src={p.final_video_url} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <a className="btn btn-quiet" href={`${p.final_video_url}?download=${filename}.mp4`}>
              Download video
            </a>
            {p.status !== "done" && (
              <span className="text-slate">This is the previous version. Generate again to apply your edits.</span>
            )}
          </div>
        </section>
      )}

      {busy && (
        <section className="max-w-3xl" aria-live="polite">
          <div className="h-3 overflow-hidden rounded-sm bg-line">
            <div className="progress-bar h-full w-full" />
          </div>
          <p className="mt-2">
            {p.status === "queued" ? "Waiting for a free worker…" : STAGE_TEXT[p.stage ?? ""] ?? "Working…"}
          </p>
          <p className="text-sm text-slate">This usually takes one to three minutes. You can leave this page.</p>
        </section>
      )}

      {p.status === "failed" && p.error && <p className="max-w-3xl text-danger">{p.error}</p>}

      {!busy && p.status !== "done" && (
        <section>
          <button className="btn btn-primary" disabled={render.isPending} onClick={() => render.mutate()}>
            {p.final_video_url || p.status === "failed" ? "Generate again" : "Generate video"} · {renderCost} credits
          </button>
          {render.isError && <p className="mt-3 text-danger">{(render.error as Error).message}</p>}
        </section>
      )}

      <section>
        <h2 className="mb-1 font-display text-2xl font-bold">Storyboard</h2>
        <p className="mb-5 max-w-prose text-slate">
          Edit the narration or the picture description for any scene. Images appear after you generate the video.
        </p>
        <div className="space-y-6">
          {p.scenes?.map((s) => (
            <SceneRow key={s.id} scene={s} disabled={busy} onChanged={() => qc.invalidateQueries({ queryKey: ["project", id] })} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SceneRow({ scene, disabled, onChanged }: { scene: Scene; disabled: boolean; onChanged: () => void }) {
  const [narration, setNarration] = useState(scene.narration);
  const [visual, setVisual] = useState(scene.visual_prompt);

  useEffect(() => {
    setNarration(scene.narration);
    setVisual(scene.visual_prompt);
  }, [scene.narration, scene.visual_prompt]);

  const dirty = narration.trim() !== scene.narration || visual.trim() !== scene.visual_prompt;

  const save = useMutation({
    mutationFn: () => api.editScene(scene.id, { narration, visual_prompt: visual }),
    onSuccess: onChanged,
  });
  const redraw = useMutation({
    mutationFn: () => api.editScene(scene.id, { regenerate_image: true }),
    onSuccess: onChanged,
  });

  const error = (save.error ?? redraw.error) as Error | null;

  return (
    <article className="grid gap-4 border-t border-line pt-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="aspect-video overflow-hidden bg-white ring-1 ring-line">
        {scene.image_url ? (
          <img src={scene.image_url} alt={scene.visual_prompt} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate">
            Image not made yet
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Narration</span>
          <textarea
            className="field"
            rows={3}
            maxLength={400}
            disabled={disabled}
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Picture</span>
          <textarea
            className="field"
            rows={2}
            maxLength={500}
            disabled={disabled}
            value={visual}
            onChange={(e) => setVisual(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn btn-quiet !py-1.5"
            disabled={disabled || !dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
          {scene.image_url && (
            <button
              className="btn btn-quiet !py-1.5"
              disabled={disabled || redraw.isPending}
              onClick={() => redraw.mutate()}
            >
              Redraw image
            </button>
          )}
          {error && <span className="text-danger">{error.message}</span>}
        </div>
      </div>
    </article>
  );
}
