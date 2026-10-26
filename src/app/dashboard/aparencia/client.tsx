"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Search, X, Sparkles } from "lucide-react";
import {
  THEMES,
  BG_PATTERNS,
  THEME_CATEGORY_ORDER,
  themeCategory,
  type ThemeKey,
  type Theme,
} from "@/lib/themes";
import { getThemePriceCents, formatThemePriceBRL } from "@/lib/theme-prices";
import { centsToBRLInput } from "@/lib/money";
import type { UserSettingsData } from "@/lib/user-settings";
import {
  saveAppearance,
  purchaseTheme,
  purchaseThemeWithPix,
  purchaseCustomTheme,
  purchaseCustomThemeWithBalance,
} from "./actions";

const FREE_KEYS = new Set([
  "midnight",
  "daylight",
  "gamer",
  "glass",
  "sunset",
  "matrix",
  "ocean",
]);
// Preco fica computado dinamicamente por tema via getThemePriceCents()
// (Blame = R$ 100, demais = R$ 5). Mantem fallback de 500 quando nao
// tem tema selecionado pra evitar NaN nos calculos do modal.
const FALLBACK_THEME_PRICE_CENTS = 500;

export function AppearanceClient({
  defaults,
  ownedThemes,
  balanceCents,
}: {
  defaults: UserSettingsData;
  ownedThemes: string[];
  balanceCents: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [theme, setTheme] = useState<ThemeKey>(defaults.theme as ThemeKey);
  const [bgPattern, setBgPattern] = useState(defaults.bgPattern);
  const [themeQuery, setThemeQuery] = useState("");
  const [owned, setOwned] = useState<Set<string>>(() => new Set(ownedThemes));
  const [currentBalance, setCurrentBalance] = useState(balanceCents);
  const [purchaseTarget, setPurchaseTarget] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [pixPurchase, setPixPurchase] = useState<{
    pixCopyPaste: string;
    pixQrCodeBase64: string | null;
  } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  async function handlePixPurchase() {
    if (!purchaseTarget) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const r = await purchaseThemeWithPix(purchaseTarget);
      if (r.ok) {
        setPixPurchase({
          pixCopyPaste: r.pixCopyPaste,
          pixQrCodeBase64: r.pixQrCodeBase64 ?? null,
        });
      } else {
        setPurchaseError(r.error ?? "Erro");
      }
    } catch {
      setPurchaseError("Erro ao gerar PIX. Tente novamente.");
    } finally {
      setPurchasing(false);
    }
  }

  const ownedKey = useMemo(() => Array.from(owned).join(","), [owned]);
  // ownedKey makes ESLint happy and re-triggers picker re-render on purchase
  void ownedKey;

  function isOwned(key: string): boolean {
    return FREE_KEYS.has(key) || owned.has(key);
  }

  async function handleConfirmPurchase() {
    if (!purchaseTarget) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const r = await purchaseTheme(purchaseTarget);
      if (r.ok) {
        // Atualiza estado local — sem precisar de full reload
        const next = new Set(owned);
        next.add(purchaseTarget);
        setOwned(next);
        setCurrentBalance((b) =>
          Math.max(0, b - getThemePriceCents(purchaseTarget)),
        );
        setTheme(purchaseTarget as ThemeKey);
        setPurchaseTarget(null);
        // refresh dashboard layout (saldo no header)
        router.refresh();
      } else {
        setPurchaseError(r.error ?? "Erro");
      }
    } catch {
      setPurchaseError("Erro ao processar compra. Tente novamente.");
    } finally {
      setPurchasing(false);
    }
  }

  // Filtra os temas pelo termo de busca (match em label, key OU description)
  const normalizedQuery = themeQuery.trim().toLowerCase();
  const visibleThemes = normalizedQuery
    ? THEMES.filter(
        (t) =>
          t.label.toLowerCase().includes(normalizedQuery) ||
          t.key.toLowerCase().includes(normalizedQuery) ||
          t.description.toLowerCase().includes(normalizedQuery),
      )
    : THEMES;

  // Valores não-aparência (preservados pra saveAppearance não resetar)
  const displayName = defaults.displayName ?? "";
  const avatarUrl = defaults.avatarUrl ?? "";
  const monthlyGoal = defaults.monthlyGoalCents
    ? centsToBRLInput(defaults.monthlyGoalCents)
    : "";
  const soundEnabled = defaults.soundEnabled;
  const privacyMode = defaults.privacyMode;

  const [saved, setSaved] = useState(false);
  const initialRender = useRef(true);

  // Aplica o tema NO DOM imediatamente — sem esperar refresh do servidor.
  // Procura o wrapper do dashboard ([data-theme]) e atualiza os atributos.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const wrapper = document.querySelector<HTMLElement>("[data-theme]");
    if (wrapper) {
      wrapper.setAttribute("data-theme", theme);
      wrapper.setAttribute("data-bg-pattern", bgPattern);
      // Cor de destaque REMOVIDA (17/07/2026, davi): é definida por tema;
      // seller não sobrescreve mais. Limpa var se veio setada de antes.
      wrapper.style.removeProperty("--tp-accent");
    }
  }, [theme, bgPattern]);

  // Auto-save sempre que algo muda (debounced 400ms) — persistência em background
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      const fd = new FormData();
      fd.set("theme", theme);
      fd.set("bgPattern", bgPattern);
      // accentColor removido (17/07/2026): sempre string vazia (server aceita
      // optional/nullable, então "" = usa padrão do skin).
      fd.set("accentColor", "");
      fd.set("displayName", displayName);
      fd.set("avatarUrl", avatarUrl);
      fd.set("monthlyGoal", monthlyGoal);
      if (soundEnabled) fd.set("soundEnabled", "on");
      if (privacyMode) fd.set("privacyMode", "on");
      startTransition(async () => {
        const r = await saveAppearance(fd);
        if (r.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [theme, bgPattern, displayName, avatarUrl, monthlyGoal, soundEnabled, privacyMode, router]);

  // Card de um tema (reutilizado em cada seção de categoria)
  const renderThemeCard = (t: Theme) => {
    const active = theme === t.key;
    const isPaid = !FREE_KEYS.has(t.key);
    const userOwns = isOwned(t.key);
    const locked = isPaid && !userOwns;
    return (
      <button
        key={t.key}
        type="button"
        onClick={() => {
          if (locked) {
            setPurchaseTarget(t.key);
            setPurchaseError(null);
          } else {
            setTheme(t.key);
          }
        }}
        className={`group relative cursor-pointer overflow-hidden rounded-xl border p-3 text-left transition ${
          active
            ? "border-cyan-400/50 bg-cyan-400/[0.04]"
            : locked
              ? "border-white/[0.06] bg-white/[0.015] hover:border-amber-400/30"
              : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
        }`}
      >
        {/* Badge canto superior direito */}
        {locked && (
          <div className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-1.5 py-0.5 text-[9px] font-bold text-black shadow-md">
            <Lock className="size-2.5" /> {formatThemePriceBRL(t.key)}
          </div>
        )}
        {!locked && isPaid && userOwns && (
          <div className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-400/95 px-1.5 py-0.5 text-[9px] font-bold text-black shadow-md">
            <Sparkles className="size-2.5" /> Pago
          </div>
        )}
        <div
          className={`relative h-16 overflow-hidden rounded-lg ${locked ? "blur-[1px]" : ""}`}
          style={{ background: t.preview.bg }}
        >
          <div
            className="absolute right-2 top-2 size-3 rounded-full"
            style={{ background: t.preview.accent }}
          />
          <div
            className="absolute bottom-2 left-2 right-6 h-2 rounded"
            style={{ background: t.preview.card }}
          />
          <div
            className="absolute bottom-5 left-2 right-10 h-1.5 rounded opacity-60"
            style={{ background: t.preview.text }}
          />
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Lock className="size-5 text-amber-300" />
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p
            className={`text-sm font-medium ${locked ? "text-zinc-400" : "text-white"}`}
          >
            {t.label}
          </p>
          {active && !locked && (
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-cyan-400 text-black">
              <Check className="size-2.5" />
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-500">{t.description}</p>
      </button>
    );
  };

  // Agrupa os temas visíveis por categoria, na ordem definida em THEME_CATEGORY_ORDER.
  // Categorias sem nenhum tema (ex: filtradas pela busca) são omitidas.
  const groupedThemes = THEME_CATEGORY_ORDER.map((cat) => ({
    cat,
    items: visibleThemes.filter((t) => themeCategory(t.key) === cat.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 text-xs text-zinc-500">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5 text-zinc-400">
            <Loader2 className="size-3 animate-spin" /> Salvando…
          </span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1.5 text-cyan-300">
            <Check className="size-3" /> Salvo
          </span>
        ) : (
          <span>As mudanças se aplicam na hora</span>
        )}
      </div>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-white">Skin do gateway</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Cada skin muda fundo, cards, accent e até a vibe.{" "}
              <span className="text-zinc-600">
                ({THEMES.length} temas no total)
              </span>
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={themeQuery}
              onChange={(e) => setThemeQuery(e.target.value)}
              placeholder="Buscar tema (ex: mario, bitcoin, lgbt)..."
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 py-2 pl-9 pr-9 text-xs text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
            />
            {themeQuery && (
              <button
                type="button"
                onClick={() => setThemeQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
                aria-label="Limpar busca"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        {normalizedQuery && (
          <p className="mt-3 text-[11px] text-zinc-500">
            {visibleThemes.length === 0
              ? `Nenhum tema combina com "${themeQuery}".`
              : `${visibleThemes.length} resultado${visibleThemes.length > 1 ? "s" : ""} para "${themeQuery}".`}
          </p>
        )}

        {/* CTA "Criar tema próprio" — 17/07/2026 (davi) — no TOPO antes dos
            temas. Seller escolhe pagar com saldo ou PIX (Pluggou). */}
        <div className="mt-5">
          <CustomThemeCTA />
        </div>

        <div className="mt-5 space-y-7">
          {groupedThemes.map(({ cat, items }) => (
            <div key={cat.key}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  {cat.label}
                </h3>
                <span className="text-[10px] text-zinc-600">
                  ({items.length})
                </span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {items.map((t) => renderThemeCard(t))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modal de compra de tema — RENDERIZADO VIA PORTAL (07/07/2026, david:
          "o popup ta abrindo na box dos temas, tem que abrir na tela toda").
          Causa: ancestrais com `animation` (transform) criam containing block
          e prendem position:fixed dentro do container. Portal para document.
          body tira o modal da arvore DOM interna → fixed volta a ser relativo
          ao viewport. */}
      {purchaseTarget &&
        typeof document !== "undefined" &&
        createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-bp-in-fade"
          onClick={() => !purchasing && setPurchaseTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-gradient-to-br from-zinc-900 to-black p-6 shadow-2xl animate-bp-in-scale"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-400/20 ring-2 ring-amber-400/40">
                <Sparkles className="size-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Comprar tema</h3>
                <p className="text-xs text-zinc-400">
                  {THEMES.find((t) => t.key === purchaseTarget)?.label}
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Preço</span>
                <span className="text-xl font-bold text-amber-300">
                  {purchaseTarget
                    ? formatThemePriceBRL(purchaseTarget)
                    : "R$ 5,00"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-400">Pagamento</span>
                <span className="text-xs font-medium text-white">Saldo da carteira</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-400">Seu saldo</span>
                <span
                  className={`text-xs font-bold ${
                    currentBalance >=
                    (purchaseTarget
                      ? getThemePriceCents(purchaseTarget)
                      : FALLBACK_THEME_PRICE_CENTS)
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  R$ {(currentBalance / 100).toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="mt-2 border-t border-white/[0.06] pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Saldo após</span>
                  <span className="text-xs font-bold text-white">
                    R${" "}
                    {(
                      (currentBalance -
                        (purchaseTarget
                          ? getThemePriceCents(purchaseTarget)
                          : FALLBACK_THEME_PRICE_CENTS)) /
                      100
                    )
                      .toFixed(2)
                      .replace(".", ",")}
                  </span>
                </div>
              </div>
            </div>
            {purchaseError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                {purchaseError}
              </p>
            )}

            {pixPurchase ? (
              /* Mostra QR + copy-paste depois de gerar */
              <div className="mt-5 space-y-3">
                {pixPurchase.pixQrCodeBase64 && (
                  <div className="rounded-xl border border-white/[0.06] bg-white p-3 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        pixPurchase.pixQrCodeBase64.startsWith("data:")
                          ? pixPurchase.pixQrCodeBase64
                          : `data:image/png;base64,${pixPurchase.pixQrCodeBase64}`
                      }
                      alt="QR Code PIX"
                      className="size-48 object-contain"
                    />
                  </div>
                )}
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    PIX copia e cola
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] font-mono text-zinc-300 truncate">
                      {pixPurchase.pixCopyPaste}
                    </code>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          pixPurchase.pixCopyPaste,
                        );
                        setPixCopied(true);
                        setTimeout(() => setPixCopied(false), 2000);
                      }}
                      className="rounded-full bg-amber-400 px-3 py-1.5 text-[10px] font-bold text-black hover:bg-amber-300"
                    >
                      {pixCopied ? "✓" : "Copiar"}
                    </button>
                  </div>
                </div>
                <p className="text-center text-[10px] text-zinc-500">
                  Pague o PIX e o tema vai ser liberado em segundos.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPurchaseTarget(null);
                    setPixPurchase(null);
                  }}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] py-2 text-xs text-zinc-300 hover:bg-white/[0.06]"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPurchaseTarget(null)}
                    disabled={purchasing}
                    className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPurchase}
                    disabled={
                      purchasing ||
                      currentBalance <
                        (purchaseTarget
                          ? getThemePriceCents(purchaseTarget)
                          : FALLBACK_THEME_PRICE_CENTS)
                    }
                    className="flex-1 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-400 px-4 py-2.5 text-sm font-bold text-black hover:from-amber-300 hover:to-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {purchasing ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" /> Saldo…
                      </span>
                    ) : currentBalance <
                      (purchaseTarget
                        ? getThemePriceCents(purchaseTarget)
                        : FALLBACK_THEME_PRICE_CENTS) ? (
                      "Saldo insuficiente"
                    ) : (
                      `Saldo ${purchaseTarget ? formatThemePriceBRL(purchaseTarget) : "R$ 5,00"}`
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handlePixPurchase}
                  disabled={purchasing}
                  className="w-full rounded-lg border-2 border-blue-400/40 bg-blue-400/10 px-4 py-2.5 text-sm font-bold text-blue-300 hover:bg-blue-400/20 disabled:opacity-50"
                >
                  {purchasing ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Gerando PIX…
                    </span>
                  ) : (
                    "Pagar com PIX"
                  )}
                </button>
              </div>
            )}
            <p className="mt-3 text-center text-[10px] text-zinc-500">
              Compra única. O tema fica permanentemente liberado na sua conta.
            </p>
          </div>
        </div>,
        document.body,
      )}

      <CustomThemeModal
        balanceCents={currentBalance}
        onPaidWithBalance={(cents) =>
          setCurrentBalance((b) => Math.max(0, b - cents))
        }
      />

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <h2 className="text-sm font-medium text-white">Padrão de fundo</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {BG_PATTERNS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setBgPattern(p.key)}
              className={`relative cursor-pointer rounded-lg border p-2 text-center text-xs transition ${
                bgPattern === p.key
                  ? "border-cyan-400/50 bg-cyan-400/[0.04] text-cyan-300"
                  : "border-white/[0.08] text-zinc-300 hover:border-white/[0.15]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * CTA + modal de "Criar tema próprio" (17/07/2026, davi)
 * R$100, PIX via Pluggou, admin recebe alerta e prepara em ~1h.
 * State comunica com o modal via CustomEvent (evita prop drilling
 * gigantesco dentro do componente principal já denso).
 * ═════════════════════════════════════════════════════════════════════ */

const CUSTOM_THEME_OPEN_EVENT = "bp:openCustomTheme";

function CustomThemeCTA() {
  return (
    <div className="mt-8 flex items-center justify-between gap-4 rounded-xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/[0.06] to-transparent p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            Não achou o que queria? <span className="text-cyan-300">Cria o seu.</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">
            Pede um tema personalizado com a sua marca — fica pronto em cerca de 1h após o pagamento. <span className="text-cyan-300 font-semibold">A partir de R$ 100,00</span>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(CUSTOM_THEME_OPEN_EVENT));
          }
        }}
        className="shrink-0 rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300 transition"
      >
        Criar tema
      </button>
    </div>
  );
}

function CustomThemeModal({
  balanceCents,
  onPaidWithBalance,
}: {
  balanceCents: number;
  onPaidWithBalance: (cents: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "pix" | "done">("form");
  // NOVOS CAMPOS (17/07/2026, davi: "adcione mais opcoes...")
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [priceBRL, setPriceBRL] = useState("100,00"); // default R$100 (mínimo)
  const [friendEmailsRaw, setFriendEmailsRaw] = useState(""); // textarea (1/linha ou vírgula)
  const [error, setError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{
    pixCopyPaste: string;
    pixQrCodeBase64?: string;
    purchaseId: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Parseia "100,00" ou "100.00" ou "R$ 250,00" pra centavos.
  const priceCents = useMemo(() => {
    const cleaned = priceBRL
      .replace(/[^\d.,]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(cleaned);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [priceBRL]);

  // Parseia textarea de emails (aceita vírgula, ponto-e-vírgula, quebra de linha).
  const friendEmails = useMemo(() => {
    return friendEmailsRaw
      .split(/[,;\n]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }, [friendEmailsRaw]);

  const canPayWithBalance = balanceCents >= priceCents && priceCents >= 10_000;
  const priceValid = priceCents >= 10_000 && priceCents <= 500_000;
  const priceBRLFormatted = `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;

  useEffect(() => {
    function handler() {
      setOpen(true);
      setStep("form");
      setError(null);
      setPixData(null);
    }
    if (typeof window !== "undefined") {
      window.addEventListener(CUSTOM_THEME_OPEN_EVENT, handler);
      return () =>
        window.removeEventListener(CUSTOM_THEME_OPEN_EVENT, handler);
    }
  }, []);

  function submitPix() {
    setError(null);
    startTransition(async () => {
      const r = await purchaseCustomTheme({
        name: name.trim(),
        description,
        referenceUrl: referenceUrl.trim() || null,
        priceCents,
        friendEmails,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPixData({
        pixCopyPaste: r.pixCopyPaste,
        pixQrCodeBase64: r.pixQrCodeBase64,
        purchaseId: r.purchaseId,
      });
      setStep("pix");
    });
  }

  function submitBalance() {
    setError(null);
    startTransition(async () => {
      const r = await purchaseCustomThemeWithBalance({
        name: name.trim(),
        description,
        referenceUrl: referenceUrl.trim() || null,
        priceCents,
        friendEmails,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onPaidWithBalance(priceCents);
      setStep("done");
    });
  }

  function copyPix() {
    if (!pixData) return;
    navigator.clipboard.writeText(pixData.pixCopyPaste).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
                <Sparkles className="size-4" />
              </div>
              <h3 className="text-lg font-bold text-white">Tema personalizado</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              A partir de R$ 100,00 · pronto em ~1h após pagamento
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "form" && (
          <>
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 -mr-1">
              {/* Nome do tema */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nome do tema <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder='Ex: "X-Fitness Neon"'
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                />
                <p className="mt-1 text-[10px] text-zinc-600">
                  Aparece no seu grid de temas depois de entregue.
                </p>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Descreve o tema que você quer <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={1000}
                  placeholder="Ex: quero um tema com identidade da minha marca 'X-Fitness' — laranja vibrante (#FF6B00), preto puro, com detalhes minimalistas e cards com glow suave. Fonte principal: Inter."
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 resize-none"
                />
                <p className="mt-1 text-[10px] text-zinc-600">
                  {description.length}/1000 caracteres
                </p>
              </div>

              {/* Link de referência */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Link de referência <span className="text-zinc-600">(opcional)</span>
                </label>
                <input
                  type="url"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder="https://seusite.com ou link do Instagram/Behance"
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                />
              </div>

              {/* Preço (custom, min R$100) */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Quanto você quer pagar? <span className="text-zinc-600">(mín. R$ 100,00)</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceBRL}
                    onChange={(e) => setPriceBRL(e.target.value)}
                    placeholder="100,00"
                    className={`w-full rounded-lg border ${
                      priceValid || priceBRL.trim() === ""
                        ? "border-white/[0.1]"
                        : "border-red-500/40"
                    } bg-white/[0.02] pl-10 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 font-mono tabular-nums`}
                  />
                </div>
                <p className="mt-1 text-[10px] text-zinc-600">
                  Ofereça mais que R$100 pra ter prioridade + tema mais elaborado.
                  Total: <span className="text-zinc-400 font-medium">{priceBRLFormatted}</span>
                </p>
              </div>

              {/* Amigos que ganham grátis */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Amigos que ganham o tema grátis{" "}
                  <span className="text-zinc-600">
                    (opcional · máx. 10)
                  </span>
                </label>
                <textarea
                  value={friendEmailsRaw}
                  onChange={(e) => setFriendEmailsRaw(e.target.value)}
                  rows={3}
                  placeholder="amigo1@email.com&#10;amigo2@email.com&#10;(um por linha ou separados por vírgula)"
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 resize-none font-mono"
                />
                <p className="mt-1 text-[10px] text-zinc-600">
                  {friendEmails.length > 0
                    ? `${friendEmails.length} amigo${friendEmails.length > 1 ? "s" : ""} vão receber o tema desbloqueado (precisam ter conta na Trilho).`
                    : "Emails devem estar cadastrados na plataforma pra receber o tema desbloqueado."}
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
            </div>

            {/* Escolha do método de pagamento */}
            <div className="mt-5 space-y-2">
              <p className="text-xs font-medium text-zinc-300 mb-2">
                Como quer pagar {priceBRLFormatted}?
              </p>
              <button
                type="button"
                onClick={submitBalance}
                disabled={
                  isPending ||
                  !canPayWithBalance ||
                  !priceValid ||
                  name.trim().length < 3 ||
                  description.trim().length < 20
                }
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-cyan-400/30 bg-cyan-400/[0.06] px-4 py-3 text-left transition hover:bg-cyan-400/[0.1] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    Pagar com saldo da plataforma
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {canPayWithBalance
                      ? `Saldo atual: R$ ${(balanceCents / 100).toFixed(2).replace(".", ",")} · desconta ${priceBRLFormatted} agora`
                      : `Saldo insuficiente (R$ ${(balanceCents / 100).toFixed(2).replace(".", ",")} < ${priceBRLFormatted})`}
                  </p>
                </div>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin text-cyan-300 shrink-0" />
                ) : (
                  <span className="text-xs font-bold text-cyan-300 shrink-0">
                    {canPayWithBalance ? "USAR SALDO →" : ""}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={submitPix}
                disabled={
                  isPending ||
                  !priceValid ||
                  name.trim().length < 3 ||
                  description.trim().length < 20
                }
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/[0.1] bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    Gerar PIX
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    Paga {priceBRLFormatted} via PIX pra receber o QR code
                  </p>
                </div>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin text-zinc-400 shrink-0" />
                ) : (
                  <span className="text-xs font-bold text-zinc-300 shrink-0">
                    PIX →
                  </span>
                )}
              </button>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg border border-white/[0.1] py-2 text-sm text-zinc-300 hover:bg-white/[0.05]"
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.06] p-5 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-cyan-400/20">
                <Check className="size-6 text-cyan-300" />
              </div>
              <p className="text-base font-bold text-white">
                Pedido registrado!
              </p>
              <p className="mt-2 text-xs text-cyan-100/80 leading-relaxed">
                Pagamos R$ 100 do seu saldo. O time foi notificado e o tema
                fica pronto em cerca de 1 hora. Você recebe uma notificação
                quando estiver disponível na lista de temas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-lg bg-cyan-400 py-2 text-sm font-bold text-black hover:bg-cyan-300"
            >
              Fechar
            </button>
          </>
        )}

        {step === "pix" && pixData && (
          <>
            <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/[0.04] p-3 mb-4 text-xs text-cyan-100">
              <p className="font-medium">Pedido registrado.</p>
              <p className="mt-0.5 text-cyan-200/80">
                Assim que o PIX confirmar, o time é notificado e o tema fica pronto em cerca de 1 hora.
              </p>
            </div>

            {pixData.pixQrCodeBase64 && (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  // FIX 17/07/2026 (davi: "nao ta carregando o qr code image"):
                  // provider retorna base64 puro; browser precisa do prefixo
                  // data: pra renderizar. Idêntico ao modal de compra de tema.
                  src={
                    pixData.pixQrCodeBase64.startsWith("data:")
                      ? pixData.pixQrCodeBase64
                      : `data:image/png;base64,${pixData.pixQrCodeBase64}`
                  }
                  alt="QR Code PIX"
                  className="size-52 rounded-lg border border-white/[0.1] bg-white p-2"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Ou copia e cola
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={pixData.pixCopyPaste}
                  className="flex-1 rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-[11px] text-zinc-300 font-mono"
                />
                <button
                  type="button"
                  onClick={copyPix}
                  className="rounded-lg bg-cyan-400 px-4 text-sm font-bold text-black hover:bg-cyan-300"
                >
                  {copied ? <Check className="size-4" /> : "Copiar"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-lg border border-white/[0.1] py-2 text-sm text-zinc-300 hover:bg-white/[0.05]"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
