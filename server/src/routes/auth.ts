import { Router } from "express";
import bcrypt from "bcrypt";
import { User } from "../models";
import { AppError } from "../middleware/error";
import { asyncHandler, requireAuth, signToken } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { clearAccessCookie, setAccessCookie } from "../lib/cookies";
import { credentialsSchema, type CredentialsInput } from "../schemas";

const dummyHash = bcrypt.hashSync("timing-dummy", 10);

function publicUser(user: User) {
  return { id: user.id, username: user.username, role: user.role };
}

export const authRouter = Router();

authRouter.use(authLimiter);

authRouter.post(
  "/register",
  validateBody(credentialsSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as CredentialsInput;
    const existing = await User.findOne({ where: { username } });
    if (existing) {
      throw new AppError(409, "Username already taken", "USERNAME_TAKEN");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash, role: "user" });
    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    setAccessCookie(res, token);

    res.status(201).json({
      token,
      user: publicUser(user),
    });
  })
);

authRouter.post(
  "/login",
  validateBody(credentialsSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as CredentialsInput;
    const user = await User.findOne({ where: { username } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
    if (!user || !ok) {
      throw new AppError(401, "Invalid username or password", "INVALID_CREDENTIALS");
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    setAccessCookie(res, token);
    res.json({
      token,
      user: publicUser(user),
    });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    clearAccessCookie(res);
    res.json({ ok: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      user: {
        id: req.user!.id,
        username: req.user!.username,
        role: req.user!.role,
      },
    });
  })
);
