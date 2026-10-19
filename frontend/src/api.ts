import { supabase } from "./supabase";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type Scene = {
  id: string;
  position: number;
  narration: string;
  visual_prompt: string;
  image_url: string | null;
  audio_url: string | null;
};

export type Status = "draft" | "queued" | "rendering" | "done" | "failed";

export type Project = {
  id: string;
  topic: string;
  title: string | null;
  status: Status;
  stage: string | null;
  error: string | null;
  final_video_url: string | null;
  created_at: string;
  scenes?: Scene[];
};

export type Pack = { id: string; credits: number; amount_kobo: number };

export type Me = {
  email: string;
  credits: number;
  storyboard_cost: number;
  render_cost: number;
  packs: Pack[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
  });
  if (!res.ok) {
    let message = "Something went wrong. Try again.";
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  me: () => request<Me>("/me"),
  projects: () => request<Project[]>("/projects"),
  project: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (topic: string) => request<Project>("/projects", json({ topic })),
  editScene: (id: string, body: Partial<Pick<Scene, "narration" | "visual_prompt">> & { regenerate_image?: boolean }) =>
    request<Scene>(`/scenes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  render: (id: string) => request<{ status: string }>(`/projects/${id}/render`, { method: "POST" }),
  checkout: (pack: string) => request<{ url: string }>("/credits/checkout", json({ pack })),
  verify: (reference: string) =>
    request<{ credited: boolean; status: string }>("/credits/verify", json({ reference })),
};

export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;
