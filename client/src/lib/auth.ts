export type AuthUser = {
  id: string;
  username: string;
  role: "user" | "admin";
};

const USER_KEY = "sneaker_drop_user";
const TOKEN_KEY = "sneaker_drop_token";

let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) memoryToken = stored;
  return memoryToken;
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || !parsed.username) return null;
    return { ...parsed, role: parsed.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

export function setSession(user: AuthUser, token?: string): void {
  if (token) {
    memoryToken = token;
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  memoryToken = null;
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
