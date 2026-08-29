import toast from "react-hot-toast";
import { getHoldSeconds } from "./config";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const USER_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Your session expired. Please sign in again.",
  INVALID_CREDENTIALS: "Incorrect username or password.",
  USERNAME_TAKEN: "That username is already taken.",
  VALIDATION_ERROR: "Please check the form and try again.",
  INVALID_JSON: "The request was not valid.",
  NOT_FOUND: "We could not find that item.",
  NOT_LIVE: "This drop is not live yet.",
  ENDED: "This drop has ended.",
  SOLD_OUT: "Sold out — someone else claimed the last unit.",
  ALREADY_RESERVED: "You already have an active hold on this drop.",
  ALREADY_PURCHASED: "This reservation was already purchased.",
  RESERVATION_EXPIRED: "Your hold expired. Reserve again.",
  FORBIDDEN: "You do not have permission to do that.",
  ADMIN_REQUIRED: "Only an admin can create a drop.",
  RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  UNIQUE_CONSTRAINT: "That action conflicts with an existing record.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
  INTERNAL: "Something went wrong on our side. Try again.",
};

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export function toUserMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (isAbortError(err)) return "";
  if (err instanceof HttpError) {
    if (err.code === "RESERVATION_EXPIRED") {
      return `Your ${getHoldSeconds()}-second hold expired. Reserve again.`;
    }
    if (USER_MESSAGES[err.code]) return USER_MESSAGES[err.code];
    if (err.status >= 500) return USER_MESSAGES.INTERNAL;
    if (err.status === 401) return USER_MESSAGES.INVALID_CREDENTIALS;
    return err.message || fallback;
  }
  if (err instanceof TypeError) {
    return "Cannot reach the server. Check that the API is running.";
  }
  return fallback;
}

export function notifyError(err: unknown, fallback?: string): void {
  const message = toUserMessage(err, fallback);
  if (message) toast.error(message);
}
