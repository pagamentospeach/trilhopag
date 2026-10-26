"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  User as UserIcon,
  MapPin,
  Banknote,
  Receipt,
  ShieldCheck,
  Trash2,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  KeyRound,
  ChevronRight,
  Percent,
  CreditCard,
  FileText as FileTextIcon,
  Apple,
  Globe,
  TrendingUp,
  Wallet,
  Bell,
  Flame,
} from "lucide-react";
import Link from "next/link";
import type { DisplayFeesByMode } from "@/lib/mode-defaults";
import { PixIcon } from "@/components/icons/pix-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/file-upload";
import {
  saveProfile,
  saveIdentity,
  saveAddress,
  saveKycDocument,
  deleteKycDocument,
  resendVerificationEmail,
} from "./actions";
import { SecuritySection } from "./security-section";
import { NotificacoesTab } from "./notificacoes-section";
import { modeHasCard, toOpsMode, type OpsMode } from "@/lib/ops-modes";

type Tab = { key: string; label: string; icon: string };
type UserData = {
  email: string;
  emailVerified: boolean;
  name: string;
  cpfCnpj: string;
  phone: string;
  displayName: string;
  avatarUrl: string;
  feePercent: number;
  feeFixedCents: number;
  cardFeePercent: number;
  cardFeeFixedCents: number;
  boletoFeePercent?: number;
  boletoFeeFixedCents?: number;
  applePayFeePercent?: number;
  applePayFeeFixedCents?: number;
  googlePayFeePercent?: number;
  googlePayFeeFixedCents?: number;
  withdrawalFeeCents?: number;
  /** Modo de adquirente do seller (PIX) — definido só pelo admin. */
  pixOpsMode?: OpsMode;
  cardOpsMode?: OpsMode;
  /** Taxas resolvidas por modo (apparent>real). Dirige a aba Taxas mode-aware. */
  modeFees?: DisplayFeesByMode;
  twoFactorEnabled: boolean;
  kycStatus: string;
  kycRejectionReason: string | null;
  isCnpj: boolean;
  personType: "PF" | "PJ";
};

type AddressData = {
  zipcode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
};

type DocData = {
  type: string;
  url: string;
  status: string;
  rejectionReason: string | null;
  updatedAt: string;
};

const ICONS = {
  user: UserIcon,
  map: MapPin,
  bank: Banknote,
  receipt: Receipt,
  shield: ShieldCheck,
  percent: Percent,
  bell: Bell,
};

/**
 * 06/08/2026 (davi): "da aba de meu pergil apaga a aba de aparencias e Minhas
 * conquistas". Os slots `aparenciaSlot`/`conquistasSlot` existiam só pra o
 * server injetar aqui os MESMOS componentes das rotas /dashboard/aparencia e
 * /dashboard/conquistas — era atalho, não feature própria. As rotas seguem no
 * ar; sumiu a duplicata. Com os slots foram os ícones palette/trophy do ICONS.
 */
export function ProfileTabs({
  tabs,
  user,
  address,
  documents,
  abaInicial,
}: {
  tabs: Tab[];
  user: UserData;
  address: AddressData | null;
  documents: DocData[];
  /**
   * Aba aberta de saída, vinda do `?tab=` da URL.
   *
   * 08/08/2026: as abas eram 100% estado local, então `/dashboard/perfil?tab=
   * notificacoes` caía sempre na primeira. Isso passou a importar quando a
   * página de Configurações começou a linkar direto pra cada aba — link que
   * ignora o destino é botão que não faz o que diz (seção 41).
   *
   * Continua sendo só o valor INICIAL: depois de aberto, quem manda é o
   * clique. Sincronizar a URL a cada troca encheria o histórico do navegador
   * de estados que ninguém quer revisitar com o botão voltar.
   */
  abaInicial?: string;
}) {
  const [active, setActive] = useState(
    () => tabs.find((t) => t.key === abaInicial)?.key ?? tabs[0].key,
  );

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="flex overflow-x-auto border-b border-white/[0.06]">
        {tabs.map((t) => {
          const Icon = ICONS[t.icon as keyof typeof ICONS] ?? UserIcon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`inline-flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition ${
                isActive
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-6">
        {active === "perfil" && (
          <div className="space-y-10">
            <PerfilTab user={user} />
            {/* Segurança movida pra dentro do Perfil (aba separada removida). */}
            <div className="space-y-4 border-t border-white/[0.06] pt-8">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="size-4 text-cyan-400" /> Segurança
              </h3>
              <SegurancaTab
                email={user.email}
                emailVerified={user.emailVerified}
                twoFactorEnabled={user.twoFactorEnabled}
              />
            </div>
          </div>
        )}
        {active === "comprovantes" && (
          <ComprovantesTab
            documents={documents}
            isCnpj={user.isCnpj}
            kycStatus={user.kycStatus}
            kycRejectionReason={user.kycRejectionReason}
          />
        )}
        {active === "taxas" && <TaxasTab user={user} />}
        {active === "notificacoes" && <NotificacoesTab />}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p
        className={`mt-0.5 font-mono text-xs tabular-nums sm:text-sm ${highlight ? "font-bold text-cyan-400" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}

/* O componente `FeeCard` e a paleta `FEE_COLORS` moravam aqui. Eram usados
   EXCLUSIVAMENTE pelos cards de "funções pagas" que davi mandou tirar da aba
   Taxas (06/08/2026), então saíram junto em vez de ficarem como código morto. */

function TaxasTab({ user }: { user: UserData }) {
  // 08/08/2026 (davi): "os modos de adquirentes serao selecionados pelos ADMINS
  // somente — o SELLER NUNCA VAI PODER MEXER NISSO E NEM VAI TER ESSA OPCAO PRA
  // ELE EM LUGAR NENHUM". Aqui existia um seletor de modo pro seller
  // simular taxas de outros modos; agora a aba só mostra as taxas do modo que
  // o admin definiu pra conta.
  const mode = toOpsMode(user.pixOpsMode);
  const cardOn = modeHasCard(mode);

  // Taxas resolvidas POR MODO (apparent>real, vindas do server). Fallback pros
  // campos flat legados caso o server não tenha mandado modeFees.
  const f =
    user.modeFees?.[mode] ??
    ({
      pixPct: user.feePercent,
      pixFix: user.feeFixedCents,
      cardPct: cardOn ? user.cardFeePercent : null,
      cardFix: cardOn ? user.cardFeeFixedCents : null,
      withdrawalFeeCents: user.withdrawalFeeCents ?? 200,
    } as DisplayFeesByMode["white"]);
  const hotFlatCents = user.modeFees?.hotFlatCents ?? 100;

  const cardPct = f.cardPct ?? user.cardFeePercent;
  const cardFix = f.cardFix ?? user.cardFeeFixedCents;

  // Linhas de método conforme o modo: black/hot = só PIX; white e SAG = PIX +
  // cartão + wallets. Quem decide é `modeHasCard` (fonte única em ops-modes).
  // `iconCls` (a cor própria de cada método: PIX ciano, cartão azul, GPay
  // esmeralda...) saiu no clean de 06/08/2026 — eram 4 cores só nesta lista.
  // Todos os chips agora usam o mesmo cinza neutro.
  const rows: Array<{
    method: string;
    Icon: React.ComponentType<{ className?: string }>;
    desc: string;
    pct: number;
    fixed: number;
    holding: string;
  }> = [
    {
      method: "PIX",
      // 06/08/2026 (davi): "troca o icone de flash pelo de pix". O `Zap` do
      // lucide (raio) era genérico de "energia"; agora é o glifo do Pix, o
      // mesmo componente já usado no KPI do dashboard e nos adquirentes.
      Icon: PixIcon,
      desc:
        mode === "hot"
          ? "Vendas a partir de R$ 16 usam esta taxa."
          : "Aprovação instantânea, taxa mais baixa.",
      pct: f.pixPct,
      fixed: f.pixFix,
      holding: "Liberado ~1 min após o pagamento.",
    },
  ];
  if (cardOn) {
    rows.push(
      {
        method: "Cartão de Crédito",
        Icon: CreditCard,
        desc: "Visa, Master, Elo, Hiper, Amex, Diners.",
        pct: cardPct,
        fixed: cardFix,
        holding:
          "Cai em D+30 · retenção de 10% por 90 dias (cobertura de chargeback).",
      },
      {
        method: "Apple Pay",
        Icon: Apple,
        desc: "Pagamento via wallet Apple.",
        pct: user.applePayFeePercent ?? cardPct,
        fixed: user.applePayFeeFixedCents ?? cardFix,
        holding: "Cai em D+30 (mesmas regras de cartão).",
      },
      {
        method: "Google Pay",
        Icon: Globe,
        desc: "Pagamento via wallet Google.",
        pct: user.googlePayFeePercent ?? cardPct,
        fixed: user.googlePayFeeFixedCents ?? cardFix,
        holding: "Cai em D+30 (mesmas regras de cartão).",
      },
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-white">
          <Percent className="size-4 text-cyan-400" /> Suas taxas
        </h2>
        <p className="mt-1 max-w-xl text-xs text-zinc-400">
          Estas são as taxas aplicadas na sua conta hoje. Precisando de um
          ajuste, fale com o suporte.
        </p>
      </div>

      {/* Hot: aviso da taxa flat (< R$16) */}
      {mode === "hot" && (
        <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <Flame className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          <div className="text-xs text-zinc-400">
            <p>
              <strong className="text-white">
                Taxa única de R${" "}
                {(hotFlatCents / 100).toFixed(2).replace(".", ",")}
              </strong>{" "}
              por venda em valores{" "}
              <strong className="text-zinc-200">abaixo de R$ 16,00</strong> —
              sem porcentagem.
            </p>
            <p className="mt-1 text-zinc-500">
              Vendas a partir de R$ 16,00 cobram a taxa de PIX mostrada abaixo
              (anti-abuso de ticket alto no flat).
            </p>
          </div>
        </div>
      )}

      {/* Cards-grid (mobile-first) — uma linha por método */}
      <div className="space-y-3">
        {rows.map((r) => {
          const Icon = r.Icon;
          const exemploNet = 100 - (100 * r.pct) / 100 - r.fixed / 100;
          return (
            <div
              key={r.method}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.12]"
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{r.method}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{r.desc}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Líquido em R$ 100
                  </p>
                  <p className="text-base font-bold text-cyan-400 tabular-nums">
                    R$ {exemploNet.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-black/30 p-2 sm:gap-3 sm:p-3">
                <Stat label="% sobre valor" value={`${r.pct.toFixed(2)}%`} />
                <Stat label="Taxa fixa" value={`R$ ${(r.fixed / 100).toFixed(2)}`} />
                <Stat
                  label="Líquido R$ 100"
                  value={`R$ ${exemploNet.toFixed(2)}`}
                  highlight
                />
              </div>

              <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-zinc-400">
                <Clock className="mt-0.5 size-3 shrink-0 text-zinc-500" />
                <span>
                  <strong className="text-zinc-300">Liberação:</strong>{" "}
                  {r.holding}
                </span>
              </p>
            </div>
          );
        })}

        {/* Saque PIX — box igual ao dos métodos (taxa fixa por saque).
            O roxo (borda + gradiente + ícone + valor) saiu no clean de
            06/08/2026: era a única cor da tela sem significado nenhum, só
            "diferenciava" um card que já é diferente pelo título. */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.12]">
          <div className="flex items-center gap-4">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Saque PIX</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Taxa fixa por solicitação de saque.
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Por saque
              </p>
              <p className="text-base font-bold text-white tabular-nums">
                R${" "}
                {(f.withdrawalFeeCents / 100)
                  .toFixed(2)
                  .replace(".", ",")}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-black/30 p-2 sm:gap-3 sm:p-3">
            <Stat
              label="Taxa por saque"
              value={`R$ ${(f.withdrawalFeeCents / 100)
                .toFixed(2)
                .replace(".", ",")}`}
            />
            <Stat label="Mínimo" value="R$ 10,00" />
            {/* Sem `highlight`: o ciano ficou reservado pro dinheiro que sobra
                pro seller (o líquido). "Instantâneo" não é valor. */}
            <Stat label="Liberação" value="Instantâneo" />
          </div>
        </div>
      </div>

      {/* 06/08/2026 (davi): "Tira isso das taxas" — saiu daqui a fileira de
          cards de "funções pagas" (Bturb, Best Tracker, Camuflagens e Subir
          Campanhas). A aba Taxas ficou só com o que é taxa de verdade: os
          métodos de pagamento, o saque e a fórmula. Junto foram os contadores
          que só alimentavam esses cards (bturbPlaysUsed, metadadosUsesUsed,
          massCampaign* e o count de vendas do mês do tracker). */}

      {/* Composição da fórmula */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <Receipt className="size-3.5 text-zinc-500" /> Como calculamos
        </p>
        {/* Era ciano + azul + âmbar numa linha só (três cores pra "colorir
            sintaxe" de uma conta de somar). Virou monocromático: os termos
            ficam em branco/zinc e a leitura é a mesma. */}
        <p className="mt-2 font-mono text-xs text-zinc-500">
          <span className="text-white">líquido</span> = valor − (valor ×{" "}
          <span className="text-zinc-300">taxa%</span>) −{" "}
          <span className="text-zinc-300">taxa fixa</span>
        </p>
        <p className="mt-2 text-[11px] text-zinc-500">
          Ex.: PIX de R$ 100 com {f.pixPct.toFixed(2)}% + R${" "}
          {(f.pixFix / 100).toFixed(2)} = R${" "}
          {(100 - (100 * f.pixPct) / 100 - f.pixFix / 100).toFixed(2)}{" "}
          líquido pra você.
        </p>
      </div>

      <p className="px-1 text-[10px] text-zinc-500">
        A <strong className="text-zinc-300">Liberação</strong> de cada método
        está indicada no box correspondente acima. Acompanhe os releases em
        tempo real na aba{" "}
        <strong className="text-zinc-300">Saques</strong> (calendário).
      </p>

      <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-zinc-400">
        <TrendingUp className="mt-0.5 size-4 shrink-0 text-zinc-500" />
        <div>
          <strong className="text-zinc-200">Dica:</strong> taxas mais baixas
          ficam disponíveis conforme você sobe o volume mensal. Fale com seu
          gerente de conta pra revisar.
        </div>
      </div>
    </div>
  );
}

/* ============================ PERFIL ============================ */

function PerfilTab({ user }: { user: UserData }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [personType, setPersonType] = useState<"PF" | "PJ">(user.personType);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);

  const initials = (displayName || user.name || user.email || "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Auto-save displayName + avatarUrl (Identidade) sem botão
  const identityInitialRef = useRef(true);
  useEffect(() => {
    if (identityInitialRef.current) {
      identityInitialRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      const fd = new FormData();
      fd.set("displayName", displayName);
      fd.set("avatarUrl", avatarUrl);
      saveIdentity(fd).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [displayName, avatarUrl]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await saveProfile(fd);
      if (r.ok) {
        setMsg("Perfil atualizado.");
        // recarrega para refletir personType no tab de Comprovantes
        if (typeof window !== "undefined") setTimeout(() => window.location.reload(), 500);
      } else {
        setErr(r.error || "Erro ao salvar.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 sm:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName || user.name}
            className="size-28 rounded-full border-2 border-white/[0.1] object-cover"
          />
        ) : (
          <span className="inline-flex size-28 items-center justify-center rounded-full bg-cyan-400/15 text-2xl font-semibold text-cyan-300">
            {initials}
          </span>
        )}
        <div className="w-full">
          <FileUpload
            purpose="avatar"
            accept="image/*"
            currentUrl={avatarUrl || null}
            onUploaded={(r) => setAvatarUrl(r.url)}
            onCleared={() => setAvatarUrl("")}
            label="Mudar avatar"
            helper="JPG, PNG ou WEBP — máx. 10MB"
          />
        </div>
        <div className="text-center text-xs text-zinc-500">
          <p className="font-medium text-zinc-300">{user.email}</p>
          {user.cpfCnpj && <p className="mt-1 font-mono">{user.cpfCnpj}</p>}
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-300">
          <ShieldCheck className="size-3" />
          Taxa: {user.feePercent}% + R$ {(user.feeFixedCents / 100).toFixed(2)}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Tipo de conta</Label>
          <input type="hidden" name="personType" value={personType} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPersonType("PF")}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition ${
                personType === "PF"
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
              }`}
            >
              Pessoa Física (CPF)
            </button>
            <button
              type="button"
              onClick={() => setPersonType("PJ")}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm transition ${
                personType === "PJ"
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
              }`}
            >
              Pessoa Jurídica (CNPJ)
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Define quais documentos vão ser pedidos na aba Comprovantes.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Nome de exibição (apelido)</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como você quer ser chamado"
            />
            <p className="mt-1 text-[11px] text-zinc-500">Salva automaticamente.</p>
          </div>
          <div>
            <Label>{personType === "PJ" ? "Razão social" : "Nome legal"}</Label>
            <Input name="name" defaultValue={user.name} placeholder="Como aparece em documentos" required />
          </div>
          <div>
            <Label>Email</Label>
            <Input defaultValue={user.email} disabled />
          </div>
          <div>
            <Label>Telefone / WhatsApp</Label>
            <Input name="phone" defaultValue={user.phone} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <Label>{personType === "PJ" ? "CNPJ" : "CPF"}</Label>
            <Input
              name="cpfCnpj"
              defaultValue={user.cpfCnpj}
              placeholder={
                personType === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {msg && <span className="text-xs text-cyan-300">{msg}</span>}
          {err && <span className="text-xs text-red-300">{err}</span>}
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar alterações"}
          </Button>
        </div>
        <p className="text-right text-xs text-zinc-500">
          Para alterar avatar e tema use <a href="/dashboard/aparencia" className="text-cyan-300 hover:underline">Aparência</a>.
        </p>
      </div>
    </form>
  );
}

/* ============================ ENDEREÇO ============================ */

function EnderecoTab({ address }: { address: AddressData | null }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  const [form, setForm] = useState<AddressData>(
    address ?? {
      zipcode: "",
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      country: "BR",
    },
  );

  function set<K extends keyof AddressData>(k: K, v: AddressData[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function lookupCep(cep: string) {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((s) => ({
          ...s,
          street: data.logradouro || s.street,
          neighborhood: data.bairro || s.neighborhood,
          city: data.localidade || s.city,
          state: data.uf || s.state,
        }));
      }
    } catch {
      // ignore
    } finally {
      setCepLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await saveAddress(fd);
      if (r.ok) setMsg("Endereço salvo.");
      else setErr(r.error || "Erro ao salvar.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-sm font-medium text-white">Endereço de entrega</p>
        <p className="mt-1 text-xs text-zinc-400">
          Usado nos relatórios fiscais e em qualquer envio físico.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <Label>CEP</Label>
          <div className="relative">
            <Input
              name="zipcode"
              value={form.zipcode}
              onChange={(e) => set("zipcode", e.target.value)}
              onBlur={(e) => lookupCep(e.target.value)}
              placeholder="00000-000"
              required
            />
            {cepLoading && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-400" />
            )}
          </div>
        </div>

        <div className="sm:col-span-4">
          <Label>Rua / Logradouro</Label>
          <Input
            name="street"
            value={form.street}
            onChange={(e) => set("street", e.target.value)}
            required
          />
        </div>

        <div className="sm:col-span-2">
          <Label>Número</Label>
          <Input
            name="number"
            value={form.number}
            onChange={(e) => set("number", e.target.value)}
            required
          />
        </div>

        <div className="sm:col-span-4">
          <Label>Complemento</Label>
          <Input
            name="complement"
            value={form.complement}
            onChange={(e) => set("complement", e.target.value)}
            placeholder="Apto, bloco, ponto de referência"
          />
        </div>

        <div className="sm:col-span-2">
          <Label>Bairro</Label>
          <Input
            name="neighborhood"
            value={form.neighborhood}
            onChange={(e) => set("neighborhood", e.target.value)}
            required
          />
        </div>

        <div className="sm:col-span-2">
          <Label>Cidade</Label>
          <Input
            name="city"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            required
          />
        </div>

        <div className="sm:col-span-1">
          <Label>UF</Label>
          <Input
            name="state"
            value={form.state}
            onChange={(e) => set("state", e.target.value.toUpperCase())}
            maxLength={2}
            required
          />
        </div>

        <div className="sm:col-span-1">
          <Label>País</Label>
          <Input
            name="country"
            value={form.country}
            onChange={(e) => set("country", e.target.value.toUpperCase())}
            maxLength={2}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-xs text-cyan-300">{msg}</span>}
        {err && <span className="text-xs text-red-300">{err}</span>}
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "Salvar endereço"}
        </Button>
      </div>
    </form>
  );
}

/* ============================ COMPROVANTES (KYC) ============================ */

const DOC_LABELS: Record<string, { title: string; desc: string }> = {
  doc_front: {
    title: "Documento (frente)",
    desc: "RG ou CNH, lado da foto.",
  },
  doc_back: {
    title: "Documento (verso)",
    desc: "Verso do RG ou CNH.",
  },
  selfie: {
    title: "Selfie",
    desc: "Selfie segurando o documento aberto ao lado do rosto.",
  },
  contract_social: {
    title: "Contrato social",
    desc: "Apenas para CNPJ — última alteração contratual.",
  },
};

function ComprovantesTab({
  documents,
  isCnpj,
  kycStatus,
  kycRejectionReason,
}: {
  documents: DocData[];
  isCnpj: boolean;
  kycStatus: string;
  kycRejectionReason: string | null;
}) {
  const types: string[] = ["doc_front", "doc_back", "selfie"];
  if (isCnpj) types.push("contract_social");
  const byType = new Map(documents.map((d) => [d.type, d]));

  return (
    <div className="space-y-5">
      <KycStatusBanner status={kycStatus} reason={kycRejectionReason} />

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-zinc-400">
        Envie a URL pública do arquivo (use o upload do seu Drive/Dropbox e cole o link). O suporte
        revisa em até 24h úteis. Aceitamos JPG, PNG e PDF.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {types.map((type) => (
          <DocCard key={type} type={type} current={byType.get(type) || null} />
        ))}
      </div>
    </div>
  );
}

function KycStatusBanner({ status, reason }: { status: string; reason: string | null }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock; desc: string }> = {
    not_started: {
      label: "Não iniciado",
      cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/20",
      Icon: Clock,
      desc: "Envie seus documentos pra liberar saques acima de R$ 5.000.",
    },
    under_review: {
      label: "Em análise",
      cls: "bg-yellow-400/15 text-yellow-200 border-yellow-400/20",
      Icon: Clock,
      desc: "Recebemos seus documentos. Análise em até 24h úteis.",
    },
    approved: {
      label: "Aprovado",
      cls: "bg-cyan-400/15 text-cyan-300 border-cyan-400/20",
      Icon: CheckCircle2,
      desc: "Conta verificada — todos os limites liberados.",
    },
    rejected: {
      label: "Rejeitado",
      cls: "bg-red-400/15 text-red-300 border-red-400/20",
      Icon: AlertCircle,
      desc: reason || "Algum documento foi recusado. Reenvie corrigido.",
    },
  };
  const info = map[status] ?? map.not_started;
  const Icon = info.Icon;

  return (
    <div className={`rounded-xl border p-4 ${info.cls}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <p className="text-sm font-medium">KYC: {info.label}</p>
      </div>
      <p className="mt-1 text-xs opacity-90">{info.desc}</p>
    </div>
  );
}

function DocCard({ type, current }: { type: string; current: DocData | null }) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const meta = DOC_LABELS[type];

  function onUploaded(url: string) {
    setErr(null);
    const fd = new FormData();
    fd.set("type", type);
    fd.set("url", url);
    startTransition(async () => {
      const r = await saveKycDocument(fd);
      if (!r.ok) setErr(r.error || "Erro ao salvar.");
    });
  }

  function onDelete() {
    if (!confirm("Remover este documento?")) return;
    startTransition(async () => {
      await deleteKycDocument(type);
    });
  }

  const statusBadge =
    current?.status === "approved" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] text-cyan-300">
        <CheckCircle2 className="size-3" /> Aprovado
      </span>
    ) : current?.status === "rejected" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-400/15 px-2 py-0.5 text-[10px] text-red-300">
        <AlertCircle className="size-3" /> Recusado
      </span>
    ) : current ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] text-yellow-200">
        <Clock className="size-3" /> Em análise
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] text-zinc-400">
        Não enviado
      </span>
    );

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{meta.title}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{meta.desc}</p>
        </div>
        {statusBadge}
      </div>

      {current?.status === "rejected" && current.rejectionReason && (
        <p className="mt-2 text-xs text-red-300">Motivo: {current.rejectionReason}</p>
      )}

      <div className="mt-3">
        <FileUpload
          purpose={`kyc_${type}`}
          accept="image/*,application/pdf"
          currentUrl={current?.url ?? null}
          onUploaded={(r) => onUploaded(r.url)}
          onCleared={current ? onDelete : undefined}
          label={current ? "Substituir arquivo" : "Enviar arquivo"}
          helper="Envia direto do seu PC — JPG, PNG, WEBP, HEIC ou PDF (máx. 10MB)"
        />
      </div>

      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      {isPending && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400">
          <Loader2 className="size-3 animate-spin" /> Processando…
        </p>
      )}
    </div>
  );
}

/* ============================ SEGURANÇA ============================ */

function SegurancaTab({
  email,
  emailVerified,
  twoFactorEnabled,
}: {
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
            <UserIcon className="size-4" />
          </span>
          <p className="text-sm font-medium text-white">Conta</p>
        </div>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-400">Email</dt>
            <dd className="text-white">{email}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-zinc-400">Email verificado</dt>
            <dd className="flex items-center gap-2">
              {emailVerified ? (
                <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-300">
                  Sim
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-yellow-400/15 px-2 py-0.5 text-xs text-yellow-300">
                    Pendente
                  </span>
                  <ResendVerificationButton />
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <Link
        href="/dashboard/api-keys"
        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 hover:border-cyan-400/30 hover:bg-white/[0.04] transition"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
            <KeyRound className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-white">API Keys</p>
            <p className="text-xs text-zinc-400">Gerar e gerenciar chaves de integração</p>
          </div>
        </div>
        <ChevronRight className="size-4 text-zinc-500" />
      </Link>

      <SecuritySection twoFactorEnabled={twoFactorEnabled} />
    </div>
  );
}

function ResendVerificationButton() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function send() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const r = await resendVerificationEmail();
      if (r.ok) setMsg("Email reenviado — confira sua caixa de entrada");
      else setErr(r.error || "Erro ao enviar.");
    });
  }

  if (msg) {
    return <span className="text-[11px] text-cyan-300">{msg}</span>;
  }
  if (err) {
    return (
      <button
        type="button"
        onClick={send}
        className="text-[11px] text-red-300 hover:text-red-200"
        title={err}
      >
        Tentar de novo
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={send}
      disabled={isPending}
      className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-400/15 disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : null}
      Reenviar email
    </button>
  );
}
