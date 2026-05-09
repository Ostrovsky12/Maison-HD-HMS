export const API = import.meta.env.BASE_URL.replace(/\/waiter\/?$/, "") + "/api";

export async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("waiter_token");
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || r.statusText);
  return j;
}
