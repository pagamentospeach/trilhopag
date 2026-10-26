"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ============================================================
 *  MÁSCARAS — formatação automática conforme digita
 * ============================================================ */

/** CPF: 852.849.120-04 (11 dígitos) */
export function maskCpf(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** CEP: 12345-678 (8 dígitos) */
export function maskCep(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Telefone BR: (11) 99999-9999 ou (11) 9999-9999 */
export function maskPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/* ============================================================
 *  EMAIL — sugestões de domínios populares
 * ============================================================ */

const POPULAR_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
];

export function EmailInput({
  value,
  onChange,
  placeholder = "email@email.com",
  inputClassName,
  inputStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Decide se mostra sugestões. Mostra quando o user tem ≥ 1 char e ainda
  // não terminou o @domain.com. Se já tem @ + algo válido, não atrapalha.
  const suggestions = useMemo(() => {
    if (!value || value.length < 1) return [];
    const atIdx = value.indexOf("@");
    if (atIdx === -1) {
      // Sem @ ainda — mostra todas as opções
      return POPULAR_DOMAINS.map((d) => `${value}@${d}`);
    }
    // Já tem @ — só sugere domínios que comecem com o que o user digitou
    const localPart = value.slice(0, atIdx);
    const domainPart = value.slice(atIdx + 1).toLowerCase();
    const matches = POPULAR_DOMAINS.filter(
      (d) => d.startsWith(domainPart) && d !== domainPart,
    );
    return matches.map((d) => `${localPart}@${d}`);
  }, [value]);

  const showSuggestions = focused && suggestions.length > 0;

  // Click fora fecha sugestões
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setFocused(false);
        setHoverIdx(-1);
      }
    }
    if (focused) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [focused]);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        autoComplete="email"
        spellCheck={false}
        className={inputClassName}
        style={inputStyle}
        onKeyDown={(e) => {
          if (!showSuggestions) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHoverIdx((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHoverIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && hoverIdx >= 0) {
            e.preventDefault();
            onChange(suggestions[hoverIdx]);
            setFocused(false);
            setHoverIdx(-1);
          } else if (e.key === "Escape") {
            setFocused(false);
            setHoverIdx(-1);
          }
        }}
      />
      {showSuggestions && (
        <div
          className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
          style={{
            // Esses defaults são pro template legacy/light. Os templates
            // podem sobrescrever via inline style se quiserem temas escuros,
            // mas a maioria dos checkouts usa fundo claro.
            background: "#fff",
            color: "#18181b",
            borderColor: "#e4e4e7",
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setFocused(false);
                setHoverIdx(-1);
              }}
              onMouseEnter={() => setHoverIdx(i)}
              className={`w-full px-3 py-2 text-left text-sm transition ${
                i === hoverIdx ? "bg-zinc-100" : "hover:bg-zinc-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 *  TELEFONE — com seletor de país (DDI) auto-detectado
 * ============================================================ */

type Country = {
  code: string;
  flag: string;
  ddi: string;
  /** locale prefix que mapeia pra esse country */
  locales: string[];
};

const COUNTRIES: Country[] = [
  { code: "BR", flag: "🇧🇷", ddi: "+55", locales: ["pt-BR", "pt"] },
  { code: "US", flag: "🇺🇸", ddi: "+1", locales: ["en-US", "en"] },
  { code: "PT", flag: "🇵🇹", ddi: "+351", locales: ["pt-PT"] },
  { code: "ES", flag: "🇪🇸", ddi: "+34", locales: ["es-ES", "es"] },
  { code: "AR", flag: "🇦🇷", ddi: "+54", locales: ["es-AR"] },
  { code: "MX", flag: "🇲🇽", ddi: "+52", locales: ["es-MX"] },
  { code: "CL", flag: "🇨🇱", ddi: "+56", locales: ["es-CL"] },
  { code: "CO", flag: "🇨🇴", ddi: "+57", locales: ["es-CO"] },
  { code: "UK", flag: "🇬🇧", ddi: "+44", locales: ["en-GB"] },
  { code: "FR", flag: "🇫🇷", ddi: "+33", locales: ["fr"] },
  { code: "DE", flag: "🇩🇪", ddi: "+49", locales: ["de"] },
  { code: "IT", flag: "🇮🇹", ddi: "+39", locales: ["it"] },
];

/** Detecta país via navigator.language (default BR). */
function detectCountry(): Country {
  if (typeof navigator === "undefined") return COUNTRIES[0];
  const langs = [navigator.language, ...(navigator.languages ?? [])];
  for (const lang of langs) {
    const found = COUNTRIES.find((c) =>
      c.locales.some(
        (l) => l.toLowerCase() === lang.toLowerCase() || lang.startsWith(l),
      ),
    );
    if (found) return found;
  }
  return COUNTRIES[0]; // default Brasil
}

export function PhoneInput({
  value,
  onChange,
  inputClassName,
  inputStyle,
  borderColor,
}: {
  value: string;
  onChange: (v: string) => void;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  borderColor?: string;
}) {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-detecta país na primeira render
  useEffect(() => {
    setCountry(detectCountry());
  }, []);

  // Aplica máscara só pra BR (outros países: passa cru)
  function handleChange(raw: string) {
    if (country.code === "BR") {
      onChange(maskPhoneBR(raw));
    } else {
      // Mantém apenas dígitos + espaços + parênteses + hífen
      onChange(raw.replace(/[^\d\s()-]/g, ""));
    }
  }

  // Click fora fecha dropdown
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  const dropdownBorder = borderColor ?? "#e4e4e7";

  return (
    <div ref={containerRef} className="relative flex items-stretch">
      {/* Botão seletor de país */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex shrink-0 items-center gap-1 rounded-l-lg px-3 py-3 text-sm focus:outline-none"
        style={{
          ...inputStyle,
          borderRight: "none",
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        <span className="text-base leading-none">{country.flag}</span>
        <span className="font-mono text-xs">{country.ddi}</span>
        <span className="text-zinc-500 text-[10px]">▾</span>
      </button>

      {/* Input do número */}
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={
          country.code === "BR" ? "(11) 99999-9999" : "número"
        }
        className={inputClassName}
        style={{
          ...inputStyle,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: "none",
        }}
      />

      {/* Dropdown de países */}
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg shadow-lg"
          style={{
            background: "#fff",
            color: "#18181b",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: dropdownBorder,
            minWidth: 200,
          }}
        >
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                setCountry(c);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                c.code === country.code ? "bg-zinc-100" : "hover:bg-zinc-50"
              }`}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span className="flex-1 text-zinc-700">{c.code}</span>
              <span className="font-mono text-xs text-zinc-500">{c.ddi}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 *  CEP — autocomplete via ViaCEP
 * ============================================================ */

export type CepLookupResult = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string; // cidade
  uf: string;
  erro?: boolean;
};

/**
 * FIX 17/07/2026 (davi: "CEP ta preenchendo um complemento nada a ver"):
 * ViaCEP devolve METADATA no campo `complemento` — strings tipo
 * "até 499/500", "de 500 a 999", "lote 5", "km 12" — que descrevem
 * a FAIXA de numeração da rua, não um complemento real da residência.
 * Preenchendo isso no input de complemento confunde o cliente e polui
 * o endereço final entregue à transportadora.
 *
 * Rejeitamos QUALQUER string que combine com esse padrão. Se ficar só
 * ruído (ex: "de 100 ao 199"), zeramos — o cliente digita o real dele.
 */
const CEP_METADATA_COMPLEMENT_RE =
  /^\s*(até|ate|de\s+\d+\s+(a|ao)|km\s+\d|lote\s+\d|nº\s*\d+\s*(a|ao))/i;

function sanitizeViacepComplemento(v: string | undefined | null): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  if (CEP_METADATA_COMPLEMENT_RE.test(s)) return "";
  return s;
}

/**
 * Busca endereço no ViaCEP. Retorna null se CEP não encontrado ou erro de
 * rede. Não trava o usuário — se falhar, ele preenche tudo na mão mesmo.
 */
export async function lookupCep(cep: string): Promise<CepLookupResult | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as CepLookupResult;
    if (data.erro) return null;
    // Sanitiza o "complemento" pra não vazar metadata do ViaCEP (ex: "até 499/500")
    // pro campo de complemento do formulário.
    return { ...data, complemento: sanitizeViacepComplemento(data.complemento) };
  } catch {
    return null;
  }
}

/**
 * Hook customizado pra fazer lookup de CEP com debounce.
 * Dispara `onResolved` quando CEP válido foi resolvido pra um endereço.
 *
 * Uso:
 * ```
 * const { lookingUp } = useCepLookup(form.cep, (addr) => {
 *   setForm({ ...form, address: addr.logradouro, ... });
 * });
 * ```
 */
export function useCepLookup(
  cep: string,
  onResolved: (addr: CepLookupResult) => void,
  /** Disable hook (pra não buscar quando user já está digitando endereço) */
  enabled = true,
) {
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setError(null);
      return;
    }
    // Evita refazer pro mesmo CEP
    if (lastFetchedRef.current === digits) return;
    lastFetchedRef.current = digits;

    const handle = setTimeout(async () => {
      setLookingUp(true);
      setError(null);
      const result = await lookupCep(digits);
      setLookingUp(false);
      if (result) {
        onResolved(result);
      } else {
        setError("CEP não encontrado — preencha à mão.");
      }
    }, 300); // debounce 300ms

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep, enabled]);

  return { lookingUp, error };
}
