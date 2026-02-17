const BASE = "";

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function api<T = unknown>(
  url: string,
  options?: ApiOptions
): Promise<T> {
  const { body, ...rest } = options || {};
  const res = await fetch(`${BASE}${url}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...rest?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}
