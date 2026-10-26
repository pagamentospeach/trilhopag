"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Tag, Sparkles, Trash2, Plus, Info, Rocket } from "lucide-react";
import { savePricing } from "./actions";

type Initial = {
  defaultThemePriceCents: number;
  themeOverrides: Record<string, number>;
  massCampaignMonthlyCents: number;
  massCampaignFreeUploadsPerCycle: number;
  massCampaignExtraUploadCents: number;
  updatedAt: string;
};

type ThemeMeta = { key: string; label: string; description: string };

export function PrecosClient({
  initial,
  paidThemes,
}: {
  initial: Initial;
  paidThemes: ThemeMeta[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [defaultThemeR, setDefaultThemeR] = useState(
    (initial.defaultThemePriceCents / 100).toFixed(2),
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initial.themeOverrides).map(([k, v]) => [
        k,
        (v / 100).toFixed(2),
      ]),
    ),
  );

  const [massMonthlyR, setMassMonthlyR] = useState(
    (initial.massCampaignMonthlyCents / 100).toFixed(2),
  );
  const [massFreeUploads, setMassFreeUploads] = useState(
    String(initial.massCampaignFreeUploadsPerCycle),
  );
  const [massExtraR, setMassExtraR] = useState(
    (initial.massCampaignExtraUploadCents / 100).toFixed(2),
  );

  function toCents(reais: string): number {
    const n = Number(reais.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }

  function save() {
    const filteredOverrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(overrides)) {
      const cents = toCents(v);
      if (cents > 0) filteredOverrides[k] = cents;
    }
    startTransition(async () => {
      const r = await savePricing({
        defaultThemePriceCents: toCents(defaultThemeR),
        themeOverrides: filteredOverrides,
        massCampaignMonthlyCents: toCents(massMonthlyR),
        massCampaignFreeUploadsPerCycle:
          Math.max(0, Math.floor(Number(massFreeUploads) || 0)),
        massCampaignExtraUploadCents: toCents(massExtraR),
      });
      if (r.ok) {
        setMsg("Salvo!");
        setTimeout(() => setMsg(null), 2500);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function addOverride(themeKey: string) {
    if (overrides[themeKey]) return;
    setOverrides({ ...overrides, [themeKey]: "" });
  }

  function removeOverride(themeKey: string) {
    const { [themeKey]: _, ...rest } = overrides;
    void _;
    setOverrides(rest);
  }

  function updateOverride(themeKey: string, value: string) {
    setOverrides({ ...overrides, [themeKey]: value });
  }

  const availableThemes = paidThemes.filter((t) => !(t.key in overrides));

  return (
    <div className="space-y-5 max-w-4xl">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-yellow-300 inline-flex items-center gap-2">
            <Tag className="size-3.5" /> Configuração
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Preços do gateway
          </h1>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            Edita os preços dos <strong>temas pagos</strong> e da assinatura{" "}
            <strong>Subir Campanhas em Massa</strong>. Mudanças refletem{" "}
            <strong>imediatamente</strong> em novas compras (cache server
            invalidado no save).
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          {msg ?? "Salvar"}
        </button>
      </header>

      <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/[0.04] p-3 flex items-start gap-3 text-[12px] text-yellow-100/80">
        <Info className="size-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Última atualização</p>
          <p className="mt-0.5 text-yellow-100/60">
            {new Date(initial.updatedAt).toLocaleString("pt-BR")} · auditado em{" "}
            <code>pricing.update</code> no AdminAuditLog
          </p>
        </div>
      </div>

      {/* TEMAS */}
      <Section title="🎨 Temas pagos" subtitle="Preço default + overrides por tema">
        <Field
          label="Preço default (R$) — aplica em todos os temas pagos sem override"
          value={defaultThemeR}
          onChange={setDefaultThemeR}
        />

        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">
            Overrides individuais
          </p>

          <div className="space-y-2">
            {Object.entries(overrides).map(([key, value]) => {
              const theme = paidThemes.find((t) => t.key === key);
              return (
                <div
                  key={key}
                  className="grid grid-cols-[200px_1fr_auto] gap-2 items-center"
                >
                  <div>
                    <p className="text-xs text-zinc-200 font-semibold">
                      {theme?.label ?? key}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {theme?.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => updateOverride(key, e.target.value)}
                      placeholder="0,00"
                      className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white tabular-nums"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOverride(key)}
                    className="rounded-full bg-white/[0.04] hover:bg-red-400/[0.15] p-1.5 text-zinc-500 hover:text-red-300"
                    title="Remover override (volta a usar default)"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {availableThemes.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                Adicionar override:
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {availableThemes.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => addOverride(t.key)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
                  >
                    <Plus className="size-2.5" /> {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* MASS CAMPAIGN */}
      <Section title="🚀 Subir Campanhas em Massa" subtitle="Assinatura mensal + extras">
        <Field
          label="Mensalidade (R$) — cobrada por 30 dias de acesso"
          value={massMonthlyR}
          onChange={setMassMonthlyR}
        />
        <NumField
          label="Uploads grátis incluídos no plano (por ciclo de 30 dias)"
          value={massFreeUploads}
          onChange={setMassFreeUploads}
        />
        <Field
          label="Custo por upload extra (R$) — após esgotar os grátis"
          value={massExtraR}
          onChange={setMassExtraR}
        />
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[11px] text-amber-100/80 inline-flex items-start gap-2">
          <Rocket className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Quando seller paga (saldo ou PIX), recebe{" "}
            <strong>{massFreeUploads} uploads grátis</strong> no plano. Após
            esgotar, cada upload extra debita{" "}
            <strong>R$ {massExtraR.replace(".", ",")}</strong> do saldo.
          </span>
        </div>
      </Section>

      <div className="rounded-lg border border-blue-400/20 bg-blue-400/[0.04] p-3 text-[11px] text-blue-100/80 inline-flex items-start gap-2">
        <Sparkles className="size-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>Cache:</strong> servidor cacheia os preços por 30s pra
          performance. Quando você salva, o cache é invalidado e mudanças
          ficam ativas imediatamente.
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && (
          <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white tabular-nums"
      />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white tabular-nums"
      />
    </label>
  );
}
