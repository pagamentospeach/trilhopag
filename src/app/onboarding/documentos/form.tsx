"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Building2, Loader2, User as UserIcon } from "lucide-react";
import { DocPicker } from "@/components/auth/doc-picker";
import { StepTrail } from "@/components/auth/step-trail";
import { compressImage, SERVER_LIMIT_BYTES } from "@/lib/image-compress";
import { markFirstBoot } from "@/lib/first-boot";
import {
  AuthButton,
  AuthErrorBox,
  AuthField,
  AuthInput,
} from "@/components/auth/ui";

/**
 * FUNIL DE CADASTRO POR GOOGLE / GITHUB.
 *
 * 08/08/2026 (davi): "Verifique se no register vc ja fez um funil de registro
 * especifico pra quem for se cadastrar com google ou github, isso ja deve estar
 * pronto enquanto ainda nao te passo as apis".
 *
 * Quem entra pelo social chega com nome e email já resolvidos pelo provedor —
 * e com o email JÁ CONFIRMADO, então não passa por código nenhum. Falta o que
 * o Google e o GitHub não têm como contar: CPF/CNPJ, WhatsApp, endereço e
 * documentos. É exatamente o que este formulário pede.
 *
 * Ele é o mesmo wizard do /signup, sem os passos que o provedor já resolveu:
 *   1. Seus dados  (PF/PJ, CPF ou CNPJ, WhatsApp)
 *   2. Endereço    (CEP puxa o resto)
 *   3. Documentos  (RG/CNH, selfie, contrato social se PJ)
 *
 * Assim que o botão do Google/GitHub receber as credenciais na Vercel, este
 * caminho já funciona ponta a ponta — nada aqui depende delas.
 */

const STEPS = [
  { title: "Seus dados", subtitle: "Quem é o titular da conta." },
  { title: "Endereço", subtitle: "Digite o CEP e o resto vem sozinho." },
  { title: "Documentos", subtitle: "A última etapa. Depois é só vender." },
] as const;

type Initial = {
  cpfCnpj: string;
  phone: string;
  personType: string;
  zipcode: string;
  street: string;
  number: string;
  city: string;
  state: string;
  docFrontUrl: string;
  docBackUrl: string;
  selfieUrl: string;
  contratoSocialUrl: string;
};

/** Sobe um documento e devolve a URL. Aqui o user JÁ tem sessão. */
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

export function OnboardingDocsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [personType, setPersonType] = useState<"PF" | "PJ">(
    initial.personType === "PJ" ||
      initial.cpfCnpj.replace(/\D/g, "").length === 14
      ? "PJ"
      : "PF",
  );
  const [cpfCnpj, setCpfCnpj] = useState(maskCpfOrCnpj(initial.cpfCnpj));
  const [phone, setPhone] = useState(maskPhone(initial.phone));
  const [zipcode, setZipcode] = useState(maskCep(initial.zipcode));
  const [street, setStreet] = useState(initial.street);
  const [number, setNumber] = useState(initial.number);
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [cepLoading, setCepLoading] = useState(false);
  const [docFront, setDocFront] = useState<File | null>(null);
  const [docBack, setDocBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [contratoSocial, setContratoSocial] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const isPJ = personType === "PJ";

  // Indicação NÃO é tratada aqui de propósito: o hook `user.create.after` do
  // better-auth já lê o cookie tp_ref no callback do OAuth e amarra o
  // referrer (ver bootstrapSignupFromCookies em lib/auth.ts). Repetir a
  // chamada aqui seria um request a mais pra fazer nada.

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setStreet(data.logradouro ?? "");
        setCity(data.localidade ?? "");
        setState(data.uf ?? "");
      }
    } catch {
      /* offline / ViaCEP fora do ar: preenche na mão */
    } finally {
      setCepLoading(false);
    }
  }

  /** Valida SÓ o passo pedido — erro de CEP não aparece no passo do CPF. */
  function validateStep(i: number): string | null {
    if (i === 0) {
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

    if (i === 1) {
      if (zipcode.replace(/\D/g, "").length !== 8) return "CEP inválido.";
      if (!street.trim()) return "Informe a rua.";
      if (!number.trim()) return "Informe o número.";
      if (!city.trim()) return "Informe a cidade.";
      if (state.trim().length !== 2) return "Informe o estado (UF).";
      return null;
    }

    if (!docFront && !initial.docFrontUrl)
      return "Envie a foto do documento (frente).";
    if (!selfie && !initial.selfieUrl)
      return "Envie a selfie segurando o documento.";
    if (isPJ && !contratoSocial && !initial.contratoSocialUrl)
      return "Conta PJ precisa do contrato social.";
    return null;
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // Botão do meio do wizard avança em vez de enviar. Fica no submit pra que
    // o Enter do teclado faça a mesma coisa que o clique.
    if (stepIndex < STEPS.length - 1) {
      const problem = validateStep(stepIndex);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Revalida tudo: dá pra voltar e apagar um campo.
    for (let i = 0; i < STEPS.length; i++) {
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
      setProgress("Enviando seus documentos…");
      const [front, back, self, contrato] = await Promise.all([
        docFront ? uploadDoc(docFront) : Promise.resolve(initial.docFrontUrl),
        docBack ? uploadDoc(docBack) : Promise.resolve(initial.docBackUrl || null),
        selfie ? uploadDoc(selfie) : Promise.resolve(initial.selfieUrl),
        contratoSocial
          ? uploadDoc(contratoSocial)
          : Promise.resolve(initial.contratoSocialUrl || null),
      ]);

      setProgress("Finalizando…");
      // Rota HTTP, NÃO Server Action. O ID de uma Server Action é gerado por
      // deploy: se sair uma versão nova enquanto a pessoa preenche isto aqui
      // (e preencher endereço + 3 fotos demora), o ID que o browser tem deixa
      // de existir e o envio morre com "An unexpected response was received
      // from the server." Uma rota tem URL fixa e sobrevive ao deploy.
      const res = await fetch("/api/signup/onboarding", {
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
          docFrontUrl: front,
          docBackUrl: back,
          selfieUrl: self,
          contratoSocialUrl: contrato,
        }),
      });
      const r = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok) throw new Error(r.error ?? "Não foi possível enviar.");
      // Quem entrou por Google/GitHub termina o cadastro AQUI, não no /signup —
      // então é aqui que a próxima abertura do painel vira a primeira.
      markFirstBoot();
      router.refresh();
      router.replace("/dashboard");
      return;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro inesperado. Tente de novo.",
      );
    }
    setProgress(null);
    setLoading(false);
  }

  const isLast = stepIndex === STEPS.length - 1;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <StepTrail
        steps={STEPS}
        current={stepIndex}
        onJump={(i) => {
          if (i < stepIndex) {
            setError(null);
            setStepIndex(i);
          }
        }}
      />

      {/* ---------------- PASSO 1: dados ---------------- */}
      {stepIndex === 0 ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {(["PF", "PJ"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setPersonType(t);
                  setCpfCnpj("");
                }}
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
                {t === "PF" ? "Pessoa física" : "Pessoa jurídica"}
              </button>
            ))}
          </div>

          <AuthField label={isPJ ? "CNPJ" : "CPF"} htmlFor="cpfCnpj">
            <AuthInput
              id="cpfCnpj"
              inputMode="numeric"
              placeholder={isPJ ? "00.000.000/0000-00" : "000.000.000-00"}
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(maskCpfOrCnpj(e.target.value))}
            />
          </AuthField>

          <AuthField label="WhatsApp" htmlFor="phone">
            <AuthInput
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="(11) 98765-4321"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
            />
          </AuthField>
        </div>
      ) : null}

      {/* ---------------- PASSO 2: endereço ---------------- */}
      {stepIndex === 1 ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField label="CEP" htmlFor="zipcode">
              <div className="relative">
                <AuthInput
                  id="zipcode"
                  inputMode="numeric"
                  className="pr-10"
                  placeholder="01310-000"
                  value={zipcode}
                  onChange={(e) => {
                    const v = maskCep(e.target.value);
                    setZipcode(v);
                    void lookupCep(v);
                  }}
                />
                {cepLoading ? (
                  <Loader2 className="absolute inset-y-0 right-3 my-auto size-4 animate-spin text-slate-400" />
                ) : null}
              </div>
            </AuthField>
            <AuthField label="Número" htmlFor="number">
              <AuthInput
                id="number"
                inputMode="numeric"
                placeholder="1578"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </AuthField>
          </div>

          <AuthField label="Rua" htmlFor="street">
            <AuthInput
              id="street"
              placeholder="Av. Paulista"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </AuthField>

          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <AuthField label="Cidade" htmlFor="city">
              <AuthInput
                id="city"
                placeholder="São Paulo"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </AuthField>
            <AuthField label="UF" htmlFor="state">
              <AuthInput
                id="state"
                maxLength={2}
                placeholder="SP"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
              />
            </AuthField>
          </div>
        </div>
      ) : null}

      {/* ---------------- PASSO 3: documentos ---------------- */}
      {stepIndex === 2 ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <DocPicker
              label="Documento (frente)"
              required
              file={docFront}
              onPick={setDocFront}
              hint={
                initial.docFrontUrl
                  ? "Já enviado — envie de novo pra trocar."
                  : "RG ou CNH. JPG, PNG ou PDF."
              }
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
                hint={
                  initial.selfieUrl
                    ? "Já enviada — envie de novo pra trocar."
                    : "Rosto e documento visíveis na mesma foto."
                }
              />
            </div>
            {isPJ ? (
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
              restrito ao time de compliance da Trilho.
            </p>
          </div>
        </div>
      ) : null}

      <AuthErrorBox>{error}</AuthErrorBox>

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
          {isLast
            ? loading
              ? (progress ?? "Enviando…")
              : "Enviar e liberar acesso"
            : "Continuar"}
        </AuthButton>
      </div>
    </form>
  );
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
function maskCpfOrCnpj(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length <= 11 ? maskCpf(v) : maskCnpj(v);
}
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
