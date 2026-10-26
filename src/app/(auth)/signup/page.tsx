"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  User as UserIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  BotChallengeWidget,
  type BotChallengeState,
} from "@/components/security/bot-challenge";
import { SocialAuthBlock } from "@/components/auth/social-buttons";
import { DocPicker } from "@/components/auth/doc-picker";
import {
  PasswordStrengthMeter,
  passwordRules,
} from "@/components/auth/password-strength";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { StepTrail } from "@/components/auth/step-trail";
import { compressImage, SERVER_LIMIT_BYTES } from "@/lib/image-compress";
import { markFirstBoot } from "@/lib/first-boot";
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthHeader,
  AuthInput,
} from "@/components/auth/ui";

/**
 * CADASTRO EM PASSOS — 08/08/2026 (davi): "Na tela de cadastro, divida ela em
 * passo a passo para nao ficar longa pra baixo! Enriqueça de detalhes".
 *
 * Eram ~15 campos + 3 uploads numa página só, uns 2.400px de rolagem. Agora
 * são 4 telas curtas, cada uma com uma pergunta só:
 *   1. Conta       — nome, email, senha (com medidor de força)
 *   2. Dados       — PF/PJ, CPF/CNPJ, WhatsApp
 *   3. Endereço    — CEP puxa o resto
 *   4. Documentos  — RG/CNH, selfie, anti-bot, e o botão que cria a conta
 *   5. Confirmação — código de 6 dígitos do email
 *
 * Regras importantes:
 *  - Cada passo valida SÓ o que ele mostra. Antes o erro do CEP aparecia
 *    enquanto a pessoa ainda estava mexendo na senha.
 *  - O anti-bot fica no último passo PREENCHÍVEL de propósito: o desafio
 *    expira em 5 minutos, e no primeiro passo já estaria vencido no envio.
 *  - A conta só nasce no envio do passo 4, junto com os documentos.
 *  - 08/08/2026 (davi): "A verificacao do email deveria estar junto na aba de
 *    registro!". O passo 5 mora AQUI, na mesma tela — antes o cadastro
 *    terminava jogando a pessoa em /verify-email, uma página solta que não
 *    sabia nada do que tinha acontecido e reaparecia sozinha.
 */

/**
 * Rascunho do formulário guardado no localStorage — davi 08/08/2026: "faz com
 * que tudo que a pessoa preencha na aba de registro fique salvo, caso ela
 * recarregue a página".
 *
 * SENHA FICA DE FORA de propósito: localStorage é legível por qualquer XSS
 * e por qualquer extensão do navegador, e a senha ali sobreviveria mesmo
 * depois do cadastro concluído. ARQUIVOS também ficam de fora — File não é
 * serializável e documento de identidade não deveria encostar em disco local.
 */
const DRAFT_KEY = "trilho.signupDraft.v1";

type Draft = {
  name: string;
  email: string;
  personType: "PF" | "PJ";
  cpfCnpj: string;
  phone: string;
  zipcode: string;
  street: string;
  number: string;
  city: string;
  state: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  email: "",
  personType: "PF",
  cpfCnpj: "",
  phone: "",
  zipcode: "",
  street: "",
  number: "",
  city: "",
  state: "",
};

const STEPS = [
  { title: "Sua conta", subtitle: "Como você entra na Trilho." },
  { title: "Seus dados", subtitle: "Quem é o titular da conta." },
  { title: "Endereço", subtitle: "Digite o CEP e o resto vem sozinho." },
  { title: "Documentos", subtitle: "Falta pouco. Depois é só vender." },
  { title: "Confirmação", subtitle: "Digite o código que mandamos no seu email." },
] as const;

/**
 * Último passo que a pessoa PREENCHE. O passo 5 (confirmação) não é
 * preenchimento: ele só existe depois que a conta nasceu, e é o envio do passo
 * 4 que leva até lá. Por isso "Continuar" some no 4 e vira "Criar minha conta".
 */
const FORM_STEPS = 4;
const VERIFY_STEP = 4;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const p = JSON.parse(raw) as Partial<Draft>;
    return {
      name: str(p.name),
      email: str(p.email),
      personType: p.personType === "PJ" ? "PJ" : "PF",
      cpfCnpj: str(p.cpfCnpj),
      phone: str(p.phone),
      zipcode: str(p.zipcode),
      street: str(p.street),
      number: str(p.number),
      city: str(p.city),
      state: str(p.state),
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

/**
 * Sobe um documento e devolve a URL. Só roda DEPOIS do signup: a rota de
 * upload exige sessão, então antes da conta existir não há como enviar nada.
 */
async function uploadDoc(raw: File): Promise<string> {
  const file = await compressImage(raw);
  if (file.size > SERVER_LIMIT_BYTES) {
    throw new Error(
      `"${raw.name}" é grande demais (máx ~4MB). Reduza e tente de novo.`,
    );
  }
  const fd = new FormData();
  fd.set("file", file);
  fd.set("purpose", "kyc");
  const res = await fetch("/api/dashboard/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.message || `Falha ao enviar "${raw.name}".`);
  }
  return data.url as string;
}

/** Resultado da checagem adiantada do email (passo 1). */
type EmailStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  /** Email é o da sessão aberta: cadastro que parou no meio, dá pra retomar. */
  | { kind: "resume" }
  | { kind: "taken"; message: string }
  | { kind: "blocked"; message: string };

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const ref = params.get("ref");

  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>({ kind: "idle" });
  const [cepLoading, setCepLoading] = useState(false);
  const [docFront, setDocFront] = useState<File | null>(null);
  const [docBack, setDocBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [contratoSocial, setContratoSocial] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Passo 5: o código saiu mesmo? E se não saiu, por quê?
  const [codeSent, setCodeSent] = useState(false);
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const [botChallenge, setBotChallenge] = useState<BotChallengeState>({
    token: "",
    nonce: "",
    answer: "",
    issuedAt: 0,
    expiresAt: 0,
    honeypot: "",
  });

  // Se a conta já foi criada e o envio dos documentos falhou, o retry NÃO
  // pode tentar criar a conta de novo (o email já existe).
  const accountCreated = useRef(false);

  // Restaura o rascunho só depois da hidratação — ler localStorage no
  // useState inicial faria o HTML do servidor divergir do client.
  const restored = useRef(false);
  useEffect(() => {
    setDraft(readDraft());
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* quota cheia / modo privado: rascunho é opcional */
    }
  }, [draft]);

  useEffect(() => {
    if (ref) {
      document.cookie = `tp_ref=${ref}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    }
  }, [ref]);

  const { name, email, personType, cpfCnpj, phone, zipcode, street, number, city, state } =
    draft;

  /**
   * Checagem adiantada do email, com atraso pra não disparar a cada tecla.
   * Aviso na hora vale muito mais do que descobrir no fim que o email já tem
   * dono — que era exatamente a reclamação do davi.
   */
  useEffect(() => {
    const value = email.trim();
    if (!value.includes("@") || value.length < 6) {
      setEmailStatus({ kind: "idle" });
      return;
    }
    setEmailStatus({ kind: "checking" });
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/signup/email-available", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value }),
          signal: ctrl.signal,
        });
        const data = (await r.json()) as { status?: string; message?: string };
        if (data.status === "free") setEmailStatus({ kind: "free" });
        else if (data.status === "resume") setEmailStatus({ kind: "resume" });
        else if (data.status === "taken")
          setEmailStatus({ kind: "taken", message: data.message ?? "" });
        else if (data.status === "blocked")
          setEmailStatus({ kind: "blocked", message: data.message ?? "" });
        else setEmailStatus({ kind: "idle" });
      } catch {
        // Offline ou rate limit: não trava ninguém — o /validate no envio
        // final continua sendo a barreira de verdade.
        setEmailStatus({ kind: "idle" });
      }
    }, 550);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [email]);

  function patch(next: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        patch({
          street: data.logradouro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        });
      }
    } catch {
      /* offline / ViaCEP fora do ar: o seller preenche na mão */
    } finally {
      setCepLoading(false);
    }
  }

  /** Valida SÓ o passo pedido. */
  function validateStep(i: number): string | null {
    if (i === 0) {
      if (name.trim().length < 3) return "Coloque seu nome completo.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
        return "Email inválido. Confira se não faltou nada.";
      if (emailStatus.kind === "taken" || emailStatus.kind === "blocked")
        return emailStatus.message;
      const failed = passwordRules(password).find((r) => !r.ok);
      if (failed) return `Senha: falta ${failed.label.toLowerCase()}.`;
      if (password !== passwordConfirm) return "As senhas não conferem.";
      return null;
    }

    if (i === 1) {
      const digits = cpfCnpj.replace(/\D/g, "");
      if (personType === "PF" && digits.length !== 11)
        return "CPF precisa de 11 dígitos.";
      if (personType === "PJ" && digits.length !== 14)
        return "CNPJ precisa de 14 dígitos.";

      const phoneDigits = phone.replace(/\D/g, "");
      if (phoneDigits.length < 10 || phoneDigits.length > 11)
        return "WhatsApp inválido. Use DDD + número.";
      if (phoneDigits.length === 11 && phoneDigits[2] !== "9")
        return "WhatsApp inválido. Celular com 9 dígitos começa com 9.";
      return null;
    }

    if (i === 2) {
      if (zipcode.replace(/\D/g, "").length !== 8) return "CEP inválido.";
      if (!street.trim()) return "Informe a rua.";
      if (!number.trim()) return "Informe o número.";
      if (!city.trim()) return "Informe a cidade.";
      if (state.trim().length !== 2) return "Informe o estado (UF).";
      return null;
    }

    if (!docFront) return "Envie a foto do seu documento (frente).";
    if (!selfie) return "Envie a selfie segurando o documento.";
    if (personType === "PJ" && !contratoSocial)
      return "Conta PJ precisa do contrato social.";
    if (!botChallenge.token || !botChallenge.answer)
      return "Clique no emoji da verificação.";
    return null;
  }

  function goNext() {
    const problem = validateStep(stepIndex);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(FORM_STEPS - 1, i + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // No passo da confirmação quem manda é o EmailCodeForm (botão próprio).
    // O submit do form aqui não tem o que fazer.
    if (stepIndex === VERIFY_STEP) return;

    // Botão do meio do wizard: avança em vez de enviar. Fica aqui pra que
    // Enter no teclado faça a mesma coisa que o clique.
    if (stepIndex < FORM_STEPS - 1) {
      goNext();
      return;
    }

    // Revalida TODOS os passos: alguém pode ter voltado e apagado um campo.
    for (let i = 0; i < FORM_STEPS; i++) {
      const problem = validateStep(i);
      if (problem) {
        setError(problem);
        setStepIndex(i);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      if (!accountCreated.current) {
        setProgress("Verificando seus dados…");
        // Barreiras que só o servidor consegue aplicar: anti-bot, domínio
        // próprio, email descartável, blocklist e email já cadastrado.
        const r = await fetch("/api/signup/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            botChallenge: {
              token: botChallenge.token,
              nonce: botChallenge.nonce,
              answer: botChallenge.answer,
              expiresAt: botChallenge.expiresAt,
              issuedAt: botChallenge.issuedAt,
              honeypot: botChallenge.honeypot,
            },
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(data.message || "Não foi possível criar a conta.");
        }

        // `resume` = a conta desse email É a da sessão aberta aqui. Quer
        // dizer que um cadastro anterior criou a conta e morreu antes dos
        // documentos. Pula a criação e vai direto pro que faltou, em vez de
        // acusar "você já tem login" e deixar a pessoa presa.
        if (data.resume) {
          accountCreated.current = true;
        } else {
          setProgress("Criando sua conta…");
          const { error: err } = await authClient.signUp.email({
            name,
            email,
            password,
            callbackURL: "/dashboard",
          });
          if (err) {
            throw new Error(err.message ?? "Não foi possível criar a conta.");
          }
          accountCreated.current = true;

          await fetch("/api/signup/complete-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cpfCnpj: cpfCnpj.replace(/\D/g, ""),
              phone,
              personType,
            }),
          });

          if (ref) {
            try {
              await fetch("/api/signup/attach-referral", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: ref }),
              });
            } catch {
              /* indicação é bônus, não bloqueia o cadastro */
            }
          }
        }
      }

      // Documentos: só agora, porque a rota de upload exige sessão.
      setProgress("Enviando seus documentos…");
      const [docFrontUrl, docBackUrl, selfieUrl, contratoSocialUrl] =
        await Promise.all([
          uploadDoc(docFront!),
          docBack ? uploadDoc(docBack) : Promise.resolve(null),
          uploadDoc(selfie!),
          contratoSocial ? uploadDoc(contratoSocial) : Promise.resolve(null),
        ]);

      setProgress("Finalizando…");
      // Rota HTTP, NÃO Server Action: o ID de uma Server Action muda a cada
      // deploy, e num formulário longo como este é comum sair um deploy no
      // meio — daí vinha o "An unexpected response was received from the
      // server." que o davi mandou no print. Ver /api/signup/onboarding.
      const finishRes = await fetch("/api/signup/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpfCnpj,
          phone,
          zipcode,
          street,
          number,
          city,
          state,
          docFrontUrl,
          docBackUrl,
          selfieUrl,
          contratoSocialUrl,
        }),
      });
      const result = (await finishRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!result.ok) {
        throw new Error(result.error ?? "Não foi possível enviar os documentos.");
      }

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* rascunho é opcional */
      }

      // Último passo: o código de confirmação. Dispara o envio aqui e vai
      // pro passo 5 na MESMA tela — nada de mandar a pessoa pra outra URL.
      //
      // Se o envio falhar (rate limit, Resend fora do ar), o passo 5 abre
      // dizendo o motivo e já mostrando o "entrar sem confirmar". Antes esse
      // caso caía direto no /dashboard, o gate rebatia pra /verify-email, e lá
      // não havia código nenhum esperando: a pessoa ficava girando.
      setProgress("Enviando o código de confirmação…");
      let codeSent = false;
      let sendProblem: string | null = null;
      try {
        const r = await fetch("/api/signup/send-verification-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = (await r.json().catch(() => ({}))) as {
          sent?: boolean;
          alreadyVerified?: boolean;
          message?: string;
        };
        // Retomada de um cadastro cujo email já tinha sido confirmado antes.
        if (data.alreadyVerified) {
          markFirstBoot();
          router.refresh();
          router.replace("/dashboard");
          return;
        }
        codeSent = !!data.sent;
        if (!codeSent) {
          sendProblem =
            data.message ??
            "Não conseguimos enviar o código agora. Tente reenviar em instantes.";
        }
      } catch {
        sendProblem = "Não conseguimos enviar o código agora (falha de rede).";
      }

      setCodeSent(codeSent);
      setCodeProblem(sendProblem);
      setLoading(false);
      setProgress(null);
      setStepIndex(VERIFY_STEP);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Erro inesperado. Tente novamente.";
      setError(
        accountCreated.current
          ? `${msg} Sua conta já foi criada — clique de novo pra reenviar os documentos, nada será duplicado.`
          : msg,
      );
    }

    setProgress(null);
    setLoading(false);
  }

  const isLastForm = stepIndex === FORM_STEPS - 1;
  const onVerifyStep = stepIndex === VERIFY_STEP;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <StepTrail
        steps={STEPS}
        current={stepIndex}
        // No passo 5 a conta já existe: voltar não desfaria nada.
        locked={onVerifyStep}
        onJump={(i) => {
          // Só deixa voltar. Pular pra frente sem preencher o do meio criaria
          // um passo "válido" que nunca foi visto.
          if (i < stepIndex) {
            setError(null);
            setStepIndex(i);
          }
        }}
      />

      {ref && stepIndex === 0 ? (
        <div className="rounded-xl border border-brand/40 bg-brand/[0.07] px-4 py-3 text-sm text-ink">
          Você foi convidado por{" "}
          <span className="font-mono font-semibold">{ref}</span>.
        </div>
      ) : null}

      {/* ---------------- PASSO 1: conta ---------------- */}
      {stepIndex === 0 ? (
        <div className="space-y-5">
          <SocialAuthBlock
            callbackURL="/dashboard"
            dividerLabel="ou cadastre com email"
          />

          <AuthField label="Nome completo" htmlFor="name">
            <AuthInput
              id="name"
              autoComplete="name"
              placeholder="João da Silva"
              value={name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </AuthField>

          <AuthField label="Email" htmlFor="email">
            <AuthInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) =>
                patch({ email: e.target.value.toLowerCase().trim() })
              }
            />
            <EmailHint status={emailStatus} />
          </AuthField>

          <div>
            <AuthField label="Senha" htmlFor="password">
              <div className="relative">
                <AuthInput
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-11"
                  placeholder="Crie uma senha forte"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 transition hover:text-ink"
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </AuthField>
            <PasswordStrengthMeter password={password} context={[name, email]} />
          </div>

          <AuthField label="Confirmar senha" htmlFor="passwordConfirm">
            <AuthInput
              id="passwordConfirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Digite a senha de novo"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
            {passwordConfirm && password === passwordConfirm ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
                <Check className="size-3.5" /> As senhas conferem.
              </p>
            ) : null}
          </AuthField>
        </div>
      ) : null}

      {/* ---------------- PASSO 2: dados ---------------- */}
      {stepIndex === 1 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {(["PF", "PJ"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => patch({ personType: t, cpfCnpj: "" })}
                aria-pressed={personType === t}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                  personType === t
                    ? "border-brand bg-brand/[0.07] text-ink"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                {t === "PF" ? (
                  <UserIcon className="size-4" />
                ) : (
                  <Building2 className="size-4" />
                )}
                {t === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
              </button>
            ))}
          </div>

          <AuthField
            label={personType === "PF" ? "CPF" : "CNPJ"}
            htmlFor="cpfCnpj"
            hint={
              personType === "PF"
                ? "Precisa ser o CPF do titular da conta bancária que vai receber."
                : "CNPJ ativo. O contrato social é pedido no último passo."
            }
          >
            <AuthInput
              id="cpfCnpj"
              inputMode="numeric"
              placeholder={
                personType === "PF" ? "000.000.000-00" : "00.000.000/0000-00"
              }
              value={cpfCnpj}
              onChange={(e) =>
                patch({
                  cpfCnpj:
                    personType === "PF"
                      ? maskCpf(e.target.value)
                      : maskCnpj(e.target.value),
                })
              }
            />
          </AuthField>

          <AuthField
            label="WhatsApp"
            htmlFor="phone"
            hint="É por aqui que o suporte fala com você."
          >
            <AuthInput
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 98765-4321"
              value={phone}
              onChange={(e) => patch({ phone: maskPhone(e.target.value) })}
            />
          </AuthField>
        </div>
      ) : null}

      {/* ---------------- PASSO 3: endereço ---------------- */}
      {stepIndex === 2 ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField
              label="CEP"
              htmlFor="zipcode"
              hint={cepLoading ? "Buscando endereço…" : undefined}
            >
              <AuthInput
                id="zipcode"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="01310-000"
                value={zipcode}
                onChange={(e) => {
                  const v = maskCep(e.target.value);
                  patch({ zipcode: v });
                  lookupCep(v);
                }}
              />
            </AuthField>
            <AuthField label="Número" htmlFor="number">
              <AuthInput
                id="number"
                inputMode="numeric"
                placeholder="1578"
                value={number}
                onChange={(e) => patch({ number: e.target.value })}
              />
            </AuthField>
          </div>

          <AuthField label="Rua" htmlFor="street">
            <AuthInput
              id="street"
              autoComplete="address-line1"
              placeholder="Av. Paulista"
              value={street}
              onChange={(e) => patch({ street: e.target.value })}
            />
          </AuthField>

          <div className="grid grid-cols-[1fr_5.5rem] gap-3">
            <AuthField label="Cidade" htmlFor="city">
              <AuthInput
                id="city"
                autoComplete="address-level2"
                placeholder="São Paulo"
                value={city}
                onChange={(e) => patch({ city: e.target.value })}
              />
            </AuthField>
            <AuthField label="UF" htmlFor="state">
              <AuthInput
                id="state"
                maxLength={2}
                autoComplete="address-level1"
                placeholder="SP"
                value={state}
                onChange={(e) =>
                  patch({ state: e.target.value.toUpperCase().slice(0, 2) })
                }
              />
            </AuthField>
          </div>
        </div>
      ) : null}

      {/* ---------------- PASSO 4: documentos ---------------- */}
      {stepIndex === 3 ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <DocPicker
              label="Documento (frente)"
              required
              file={docFront}
              onPick={setDocFront}
              hint="RG ou CNH. JPG, PNG ou PDF."
            />
            <DocPicker
              label="Documento (verso)"
              file={docBack}
              onPick={setDocBack}
              hint="Opcional pra CNH."
            />
            <div className="sm:col-span-2">
              <DocPicker
                label="Selfie segurando o documento"
                required
                accept="image/*"
                file={selfie}
                onPick={setSelfie}
                hint="Rosto e documento visíveis na mesma foto."
              />
            </div>
            {personType === "PJ" ? (
              <div className="sm:col-span-2">
                <DocPicker
                  label="Contrato social"
                  required
                  file={contratoSocial}
                  onPick={setContratoSocial}
                  hint="Obrigatório para contas PJ."
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-mist px-4 py-3 text-xs leading-relaxed text-slate-500">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <p>
              Seus documentos são guardados com criptografia e o acesso é
              restrito ao time de compliance da Trilho. Os arquivos só sobem
              quando você clicar em criar a conta.
            </p>
          </div>

          <BotChallengeWidget onChange={setBotChallenge} />
        </div>
      ) : null}

      {/* ---------------- PASSO 5: confirmação do email ---------------- */}
      {stepIndex === VERIFY_STEP ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="size-4" strokeWidth={3} />
            </span>
            <p className="text-[13px] font-medium leading-relaxed text-emerald-900">
              Conta criada e documentos enviados. Falta confirmar o email.
            </p>
          </div>

          <EmailCodeForm
            email={email}
            alreadySent={codeSent}
            sendProblem={codeProblem}
            onDone={() => {
              // Fim do cadastro: marca a próxima abertura do painel como a
              // primeira, pra ela rodar a sequência de abertura.
              markFirstBoot();
              // O layout do painel é Server Component e o router guarda o RSC
              // dele em cache. Sem `refresh`, a navegação pode reusar uma
              // versão renderizada antes da confirmação — e o gate rebate a
              // pessoa de volta pra tela de código.
              router.refresh();
              router.replace("/dashboard");
            }}
          />
        </div>
      ) : null}

      {/* O AuthErrorBox some sozinho quando children é vazio, mas um array
          ([texto, link]) é sempre truthy — por isso o if fica aqui fora. */}
      {error ? (
        <AuthErrorBox>
          <span>
            {error}
            {emailStatus.kind === "taken" ? (
              <>
                {" "}
                <Link
                  href="/login"
                  className="font-semibold underline underline-offset-2"
                >
                  Ir pro login
                </Link>
              </>
            ) : null}
          </span>
        </AuthErrorBox>
      ) : null}

      {/* No passo 5 quem tem botão é o EmailCodeForm. Repetir "Continuar"
          aqui só criaria dois botões disputando a mesma ação. */}
      {onVerifyStep ? null : (
        <div className="flex items-center gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 text-[15px] font-medium text-ink transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </button>
          ) : null}
          <AuthButton type="submit" loading={loading}>
            {isLastForm
              ? loading
                ? (progress ?? "Criando…")
                : "Criar minha conta"
              : "Continuar"}
          </AuthButton>
        </div>
      )}

      {isLastForm ? (
        <p className="text-center text-xs leading-relaxed text-slate-400">
          Ao criar conta você concorda com os{" "}
          <Link href="/terms" className="text-slate-500 underline-offset-2 hover:underline">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacy" className="text-slate-500 underline-offset-2 hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      ) : null}
    </form>
  );
}

function EmailHint({ status }: { status: EmailStatus }) {
  if (status.kind === "checking") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="size-3.5 animate-spin" /> Conferindo…
      </p>
    );
  }
  if (status.kind === "free") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600">
        <Check className="size-3.5" /> Email disponível.
      </p>
    );
  }
  if (status.kind === "resume") {
    return (
      <p className="mt-1.5 text-xs text-brand">
        Você já começou um cadastro com este email neste navegador. Continue e a
        gente termina de onde parou — nada será duplicado.
      </p>
    );
  }
  if (status.kind === "taken" || status.kind === "blocked") {
    return (
      <p className="mt-1.5 text-xs text-red-600">
        {status.message}{" "}
        {status.kind === "taken" ? (
          <Link href="/login" className="font-semibold underline underline-offset-2">
            Entrar
          </Link>
        ) : null}
      </p>
    );
  }
  return null;
}

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** (11) 98765-4321 — davi 08/08/2026: "ta dando pra digitar qualquer coisa no
 *  campo de numero". Só dígito entra, e o formato é montado aqui. */
function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export default function SignupPage() {
  return (
    <div className="w-full max-w-xl">
      <AuthHeader
        title="Criar sua conta"
        subtitle="Cinco passos curtos, tudo numa tela só. O que você digitar fica salvo se recarregar a página."
      />

      <AuthCard className="mt-7">
        <Suspense fallback={<div className="h-[520px]" />}>
          <SignupForm />
        </Suspense>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-slate-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-ink hover:text-brand">
          Entrar
        </Link>
      </p>
    </div>
  );
}
