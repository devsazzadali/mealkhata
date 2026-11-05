// Client API helper replacing direct database calls.
// Usage: apiGet("/boarders", { mess_id, status: "active" })
//        apiPost("/boarders", {...}), apiPatch("/boarders", id, {...}), apiDelete("/boarders", id)
// Dates are sent as ISO strings; the server coerces them to DateTime.
// Realtime channels are replaced by polling: call the load function on an
// interval (see Chat / JoinRequests / MealRequests, 15s) instead of a channel.
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string } | null)?.error ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function apiGet<T = unknown>(
  resource: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  return (await apiFetch(
    `/api/${resource}${toQuery(params)}`
  )) as T;
}

export async function apiPost<T = unknown>(
  resource: string,
  body: Record<string, unknown>
): Promise<T> {
  return (await apiFetch(`/api/${resource}`, {
    method: "POST",
    body: JSON.stringify(body),
  })) as T;
}

export async function apiPatch<T = unknown>(
  resource: string,
  id: string,
  body: Record<string, unknown>
): Promise<T> {
  return (await apiFetch(`/api/${resource}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })) as T;
}

export async function apiDelete(resource: string, id: string): Promise<void> {
  await apiFetch(`/api/${resource}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
