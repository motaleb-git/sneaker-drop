export type AuthUser = {
  id: string;
  username: string;
  role: "user" | "admin";
};

const USER_KEY = "sneaker_drop_user";

let memoryToken: string | null = null;

export function getToken(): string | null {
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
  if (token) memoryToken = token;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  memoryToken = null;
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("sneaker_drop_token");
}
