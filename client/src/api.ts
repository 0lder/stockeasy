/**
 * Unified API client with automatic JWT token attachment.
 */

const BASE = "";

function getToken(): string | null {
  return localStorage.getItem("stockeasy_token");
}

export function setToken(token: string): void {
  localStorage.setItem("stockeasy_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("stockeasy_token");
}

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Don't set Content-Type for FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const res = await fetch(BASE + path, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    // Redirect to login if not already there
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
  return res;
}

export const api = {
  get(path: string) {
    return request(path);
  },
  post(path: string, body?: any) {
    return request(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  put(path: string, body?: any) {
    return request(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  delete(path: string) {
    return request(path, { method: "DELETE" });
  },
};

// Auth endpoints
export const auth = {
  async register(username: string, password: string) {
    const res = await api.post("/api/auth/register", { username, password });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "注册失败");
    }
    const data = await res.json();
    setToken(data.token);
    return data.user;
  },
  async login(username: string, password: string) {
    const res = await api.post("/api/auth/login", { username, password });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "登录失败");
    }
    const data = await res.json();
    setToken(data.token);
    return data.user;
  },
  async me() {
    const res = await api.get("/api/auth/me");
    if (!res.ok) return null;
    return res.json();
  },
  logout() {
    clearToken();
    window.location.href = "/login";
  },
};
