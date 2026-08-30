import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Field, inputClass } from "../components/Field";
import { api } from "../lib/api";
import { setSession, type AuthUser } from "../lib/auth";
import { HttpError, notifyError } from "../lib/errors";
import { validatePassword, validateUsername } from "../lib/validation";

type Props = {
  onAuthed: (user: AuthUser) => void;
};

type FieldErrors = {
  username?: string;
  password?: string;
};

export function Login({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validate(): FieldErrors {
    return {
      username: validateUsername(username),
      password: validatePassword(password),
    };
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.username || next.password) {
      toast.error("Fix the highlighted fields");
      return;
    }

    setLoading(true);
    try {
      const fn = mode === "login" ? api.login : api.register;
      const result = await fn(username.trim(), password);
      setSession(result.user, result.token);
      onAuthed(result.user);
      toast.success(`Signed in as ${result.user.username}`);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.fields) {
          setErrors({
            username: err.fields.username,
            password: err.fields.password,
          });
        } else if (err.code === "USERNAME_TAKEN") {
          setErrors({ username: "That username is already taken." });
        }
      }
      notifyError(err, "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          Limited edition
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">Sneaker Drop</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in to reserve stock. Seed: <code>alice</code> (admin, can create
          drops) / <code>bob</code> (user), password <code>password123</code>
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3" noValidate>
          <Field label="Username" error={errors.username}>
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setErrors((prev) => ({ ...prev, username: undefined }));
              }}
              placeholder="alice"
              autoComplete="username"
              maxLength={32}
              className={inputClass(errors.username)}
            />
          </Field>
          <Field label="Password" error={errors.password}>
            <input
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              type="password"
              placeholder="At least 8 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={72}
              className={inputClass(errors.password)}
            />
          </Field>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setErrors({});
          }}
          className="mt-4 text-sm text-slate-400 underline"
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
