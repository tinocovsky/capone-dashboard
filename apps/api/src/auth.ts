/**
 * Middleware: valida o access_token do Supabase (JWT) enviado pelo Next.js.
 * Aceita header "Authorization: Bearer <jwt>" OU cookie "sb-access-token".
 * Em caso de sucesso, anexa req.user = { id, email }.
 */
import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

export function requireAuth() {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const headerToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
      const cookieToken = (req.cookies?.["sb-access-token"] ?? "").trim();
      const token = headerToken || cookieToken;
      if (!token) return res.status(401).json({ error: "missing_token" });

      // Cliente com o JWT do user — getUser() valida a assinatura e expiração
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ error: "invalid_token" });
      req.user = { id: data.user.id, email: data.user.email ?? "" };
      next();
    } catch (e) {
      next(e);
    }
  };
}
