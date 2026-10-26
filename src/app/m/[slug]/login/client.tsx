"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, KeyRound } from "lucide-react";

type Area = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  heroImageUrl: string | null;
  backgroundColor: string;
};

export function MemberLoginClient({ area }: { area: Area }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/member-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberAreaId: area.id, email, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.message || "Falha no login");
        return;
      }
      router.push(`/m/${area.slug}`);
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <html lang="pt-BR">
      <body
        style={{
          background: area.backgroundColor,
          color: "#fff",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: area.heroImageUrl
              ? `url(${area.heroImageUrl})`
              : `linear-gradient(135deg, ${area.primaryColor}, ${area.backgroundColor})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.3,
          }}
        />
        <div
          style={{
            position: "relative",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 32,
            maxWidth: 380,
            width: "100%",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            {area.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={area.logoUrl}
                alt={area.name}
                style={{ height: 40, margin: "0 auto" }}
              />
            ) : (
              <p style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                {area.name}
              </p>
            )}
            <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
              Acesso de aluno
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, opacity: 0.7, display: "block", marginBottom: 6 }}>
              Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail style={{ position: "absolute", left: 10, top: 10, width: 14, height: 14, opacity: 0.4 }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "10px 10px 10px 32px",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, opacity: 0.7, display: "block", marginBottom: 6 }}>
              Senha
            </label>
            <div style={{ position: "relative" }}>
              <KeyRound style={{ position: "absolute", left: 10, top: 10, width: 14, height: 14, opacity: 0.4 }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "10px 10px 10px 32px",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {error && (
            <p
              style={{
                color: "#fca5a5",
                fontSize: 12,
                marginBottom: 12,
                background: "rgba(239,68,68,0.1)",
                padding: 8,
                borderRadius: 6,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            style={{
              width: "100%",
              background: area.primaryColor,
              color: "#000",
              border: 0,
              borderRadius: 999,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {loading && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
            Entrar
          </button>

          <p style={{ fontSize: 11, opacity: 0.5, textAlign: "center", marginTop: 16 }}>
            Use o email da compra. Sua senha foi enviada por email após o pagamento.
          </p>
        </div>
      </body>
    </html>
  );
}
