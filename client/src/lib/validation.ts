const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

export function validateUsername(value: string): string | undefined {
  const username = value.trim();
  if (!username) return "Username is required";
  if (username.length < 3) return "Must be at least 3 characters";
  if (username.length > 32) return "Must be at most 32 characters";
  if (!USERNAME_RE.test(username)) return "Only letters, numbers, and underscores";
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return "Password is required";
  if (value.length < 8) return "Must be at least 8 characters";
  if (value.length > 72) return "Must be at most 72 characters";
  return undefined;
}

export function validateDropName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return "Product name is required";
  if (name.length > 120) return "Must be at most 120 characters";
  return undefined;
}

export function validatePrice(value: string): string | undefined {
  if (!value.trim()) return "Price is required";
  const price = Number(value);
  if (!Number.isFinite(price)) return "Enter a valid price";
  if (price < 0) return "Price cannot be negative";
  if (price > 1_000_000) return "Price is too high";
  return undefined;
}

export function validateStock(value: string): string | undefined {
  if (!value.trim()) return "Stock is required";
  const stock = Number(value);
  if (!Number.isInteger(stock)) return "Stock must be a whole number";
  if (stock < 1) return "Stock must be at least 1";
  if (stock > 1_000_000) return "Stock cannot exceed 1,000,000";
  return undefined;
}
