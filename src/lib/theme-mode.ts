/**
 * MODO ESCURO / CLARO (06/08/2026, davi).
 *
 * "Ao lado do iconezinho de olho na barra superior adcione um icone de toogle
 *  dark mode / white mode que muda a aparencia do gateway e dark (padrao) para
 *  white!"
 *
 * O toggle não é um sistema novo: ele escreve nas MESMAS duas skins que já
 * existiam em UserSettings.theme (`midnight` = escuro, `daylight` = claro),
 * as duas grátis e já validadas pelo /api/dashboard/quick-theme. Ou seja, quem
 * já tinha escolhido claro em Aparência continua no claro, e o botão só faz o
 * caminho de ida e volta entre as duas.
 *
 * O que MUDOU foi o CSS do `daylight`: antes era uma lista de overrides classe
 * a classe (cobria umas 20 utilities e deixava o resto escuro); agora inverte
 * as variáveis de cor do Tailwind v4 direto (ver src/styles/themes.css), então
 * o gateway inteiro vira claro sem precisar listar componente por componente.
 */

/** Skin escura — padrão do gateway. */
export const DARK_THEME_KEY = "midnight";

/** Skin clara — o "white mode" do toggle. */
export const LIGHT_THEME_KEY = "daylight";

/** True se a skin salva é a clara. Qualquer outra coisa conta como escura. */
export function isLightTheme(theme: string | null | undefined): boolean {
  return theme === LIGHT_THEME_KEY;
}
