"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";

  async function signInWithPassword() {
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setErr(error.message);
    else router.push(next);
  }
  async function sendMagicLink() {
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setMsg("Enviamos um link mágico para o seu email.");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!loading && email && password) void signInWithPassword();
      }}
    >
      <label htmlFor="login-email">Email</label>
      <input id="login-email" type="email" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@caponeclub.com.br" />
      <label htmlFor="login-password">Senha</label>
      <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <div className="err">{err}</div>}
      {msg && <div className="sub" style={{ color: "var(--green)", marginTop: 8 }}>{msg}</div>}
      <button type="submit" disabled={loading || !email || !password}>
        {loading ? "..." : "Entrar"}
      </button>
      <button type="button" className="ghost" onClick={sendMagicLink} disabled={loading || !email}>
        Enviar magic link
      </button>
    </form>
  );
}
