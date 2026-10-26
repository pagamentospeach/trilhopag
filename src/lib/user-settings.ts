import { prisma } from "./prisma";
import { LIGHT_THEME_KEY } from "./theme-mode";

/**
 * Shape LEGADO do dashboardLayout salvo em UserSettings.dashboardLayout (Json).
 *
 * A dashboard customizável foi removida (06/08/2026) — ninguém mais escreve
 * aqui, o tipo só existe pra ler JSON antigo sem quebrar. Os filtros de ads
 * (`utmSource`/`adAccount`) saíram junto com o best-tracker.
 */
export type DashboardLayoutData = {
  widgets?: Array<{ key: string; w: number; h: number }>;
  filters?: {
    period?: string;
    productId?: string | null;
  };
  hiddenSections?: string[];
};

/** Shape do sidebarConfig salvo em UserSettings.sidebarConfig (Json). */
export type SidebarConfigData = {
  /** Ordem custom por grupo — array de identifiers (href|label) na ordem. */
  order?: Record<string, string[]>;
  /** Override de label por identifier (href|label original). */
  labels?: Record<string, string>;
};

export type UserSettingsData = {
  theme: string;
  displayName: string | null;
  avatarUrl: string | null;
  accentColor: string | null;
  bgPattern: string;
  monthlyGoalCents: number;
  soundEnabled: boolean;
  privacyMode: boolean;
  sidebarCollapsed: boolean;
  /**
   * Layout customizado da dashboard (widgets + filtros). Carregado em
   * /dashboard/page.tsx pra decidir quais cards renderizar.
   * BUG ANTERIOR: o getUserSettings retornava sem esse campo — toda
   * customizacao do seller sumia no reload porque savedLayout era undefined.
   */
  dashboardLayout: DashboardLayoutData | null;
  /** Customização da sidebar (ordem por grupo + labels custom). */
  sidebarConfig: SidebarConfigData;
};

// 08/08/2026 (davi): "Deixa o tema white padrao quando alguem cria a conta na
// platforma". Quem nunca abriu a tela de Aparência cai neste default, então
// ele precisa bater com o que o hook de signup grava (`daylight`).
const DEFAULTS: UserSettingsData = {
  theme: LIGHT_THEME_KEY,
  displayName: null,
  avatarUrl: null,
  accentColor: null,
  // Padrão de fundo: Mesh (default da conta — Midnight + Mesh).
  bgPattern: "mesh",
  monthlyGoalCents: 0,
  soundEnabled: true,
  privacyMode: false,
  sidebarCollapsed: false,
  dashboardLayout: null,
  sidebarConfig: {},
};

export async function getUserSettings(userId: string): Promise<UserSettingsData> {
  const s = await prisma.userSettings.findUnique({ where: { userId } });
  if (!s) return DEFAULTS;
  return {
    theme: s.theme,
    displayName: s.displayName,
    avatarUrl: s.avatarUrl,
    accentColor: s.accentColor,
    bgPattern: s.bgPattern,
    monthlyGoalCents: s.monthlyGoalCents,
    soundEnabled: s.soundEnabled,
    privacyMode: s.privacyMode,
    sidebarCollapsed: s.sidebarCollapsed,
    dashboardLayout:
      s.dashboardLayout && typeof s.dashboardLayout === "object"
        ? (s.dashboardLayout as DashboardLayoutData)
        : null,
    sidebarConfig: readSidebarConfig(s),
  };
}

/**
 * Lê s.sidebarConfig de forma resiliente. O campo só passa a existir no tipo
 * do Prisma Client após `prisma generate` (roda no build de prod), então aqui
 * acessamos via cast pra não quebrar o typecheck antes da migração.
 */
function readSidebarConfig(s: object): SidebarConfigData {
  const raw = (s as { sidebarConfig?: unknown }).sidebarConfig;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as SidebarConfigData;
  }
  return {};
}

export async function ensureUserSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}
