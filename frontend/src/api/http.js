const API_BASE = "";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let detail = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function requestBlob(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
  });

  if (!res.ok) {
    let detail = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }

  return await res.blob();
}

export function apiGet(path) {
  return request(path, { method: "GET" });
}

export function apiGetBlob(path) {
  return requestBlob(path, { method: "GET" });
}

export function apiPost(path, body) {
  return request(path, {
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

export function apiPut(path, body) {
  return request(path, {
    method: "PUT",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

export function apiPatch(path, body) {
  return request(path, {
    method: "PATCH",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

export function apiDelete(path) {
  return request(path, { method: "DELETE" });
}
