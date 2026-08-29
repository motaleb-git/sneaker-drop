declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        username: string;
        role: "user" | "admin";
      };
    }
  }
}

export {};
