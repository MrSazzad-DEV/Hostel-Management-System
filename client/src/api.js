const API_ROOT = "/api";

export async function api(path, options = {}) {
  const token = localStorage.getItem("haven_token");
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      localStorage.removeItem("haven_token");
      localStorage.removeItem("haven_user");
      window.dispatchEvent(new Event("haven:unauthorized"));
    }
    throw new Error(data?.error || "Something went wrong. Please try again.");
  }
  return data;
}

export const send = (path, body, method = "POST") =>
  api(path, { method, body: JSON.stringify(body) });
