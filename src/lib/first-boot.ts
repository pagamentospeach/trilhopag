/**
 * Marca "essa pessoa acabou de terminar o cadastro" pro painel saber que a
 * próxima abertura é a PRIMEIRA e deve rodar a sequência de boot.
 *
 * Por que cookie e não uma coluna no banco: o significado que davi pediu é
 * "logo depois de registrar tudo", não "nunca abriu o painel antes". Cookie
 * de vida curta expressa exatamente isso, sem migração e sem estado
 * permanente pra dar manutenção. Quem some com o cookie (fechou o navegador,
 * demorou 10 minutos) simplesmente entra no painel direto — falhar pro lado
 * de não mostrar é o comportamento certo aqui.
 *
 * As duas funções mexem em `document`, então só rodam no cliente. O layout do
 * painel importa só a constante pra ler o cookie no servidor.
 */
export const FIRST_BOOT_COOKIE = "tp_first_boot";

/** Vale por 10 minutos: tempo de sobra pro redirect, curto pra não vazar. */
export function markFirstBoot() {
  document.cookie = `${FIRST_BOOT_COOKIE}=1; Path=/; Max-Age=600; SameSite=Lax`;
}

/** Queimado assim que a animação começa — recarregar a página não repete. */
export function clearFirstBoot() {
  document.cookie = `${FIRST_BOOT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
