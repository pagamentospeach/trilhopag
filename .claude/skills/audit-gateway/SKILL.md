---
name: audit-gateway
description: Auditoria completa do gateway Trilho — verifica saúde do schema Prisma, rotas críticas, server actions, segurança (auth, RLS, secrets), webhooks, integração com adquirentes, sistema de saldo, anti-fraude. Use sempre que o utilizador pedir "auditoria", "ver se tá tudo certo", "confirma se tá funcionando", "review do gateway", "check de saúde". Reporta achados em formato priorizado (CRÍTICO / ALTO / MÉDIO / OBSERVAÇÃO).
---

# Auditoria do Gateway Trilho

## Escopo
Trilho é um gateway de pagamentos brasileiro que orquestra adquirentes (PIX, cartão, boleto). Esta auditoria verifica:
- Integridade do schema (Prisma + Neon)
- Segurança de auth (BetterAuth)
- Server actions sensíveis (saldo, saque, compra de tema, KYC)
- Rotas e middleware
- Webhooks de adquirentes
- Anti-fraude (rate limit, validações)
- CI/CD (.github/workflows)
- Variáveis de ambiente

## Setup
```bash
cd /Users/macbookpro/Downloads/trilhopag
```

## Checklist por seção

### 1. Schema Prisma
```bash
grep -c "^model " prisma/schema.prisma
npx prisma validate
```
- Todos os models críticos têm `userId` + `@@index([userId])`?
- `Transaction`, `Withdrawal`, `ThemePurchase` têm `@@index` em `createdAt`, `status`?
- Campos monetários são `Int` (cents)? Nunca `Float`.
- `unique` constraints em chaves naturais (email, slug, etc.)?
- Cascade delete não está vazando dados de outros users?

### 2. Auth & autorização
Buscar:
- `src/lib/auth*.ts` — BetterAuth config
- `src/lib/auth-helpers.ts` — `requireUserId()`, `requireAdmin()`
- Toda rota em `src/app/dashboard/**/page.tsx` chama `requireUserId()`?
- Toda rota em `src/app/dashboard/admin/**` chama `requireAdmin()`?
- Server actions com mutação SEMPRE chamam `requireUserId()` PRIMEIRO?
- Webhooks de adquirente validam assinatura HMAC?

Comandos:
```bash
grep -L "requireUserId\|requireSessionUserId\|requireAdmin" src/app/dashboard/**/page.tsx
grep -rn "use server" src/app/dashboard --include="*.ts" | head
```

### 3. Server actions sensíveis (saldo, saque, compra)
Para cada action que mexe em `balanceCents`:
- Está dentro de `prisma.$transaction([...])`?
- Verifica saldo ANTES do débito (`balanceCents >= valor`)?
- Idempotência (chave única evitando duplicação)?
- Validação Zod no input?

Buscar:
```bash
grep -rln "balanceCents" src/lib src/app --include="*.ts" | head
```

### 4. Anti-fraude
- Rate limit em login / esqueci senha / compra de tema?
- CAPTCHA em signup?
- Verificação de IP repetido?
- Lock de conta após X tentativas falhas?

### 5. Integrações (adquirentes)
```bash
ls src/lib/acquirers 2>/dev/null
ls src/app/api/webhooks 2>/dev/null
```
Para cada adquirente:
- Webhook tem `signature` verificada?
- Timeout configurado (não trava se adquirente cair)?
- Retry com backoff?
- Logs com `transactionId` mas SEM segredos?

### 6. KYC / documentos
- `KycDocument.url` aponta para storage seguro (não `/public`)?
- URL assinada com expiração?
- Upload valida MIME type + tamanho?
- Documentos só visíveis pro owner + admin?

### 7. Saques (Withdrawal)
- Status states: requested → processing → paid/failed
- Idempotência via `idempotencyKey`?
- `reservedBalanceCents` é creditado quando withdraw é solicitado e debitado no `paid`?
- Email/notificação em cada mudança de estado?

### 8. CI/CD
```bash
cat .github/workflows/deploy.yml
```
- Token Vercel está em GitHub Secrets (não no repo)?
- Build roda lint + typecheck + (opcional) tests?
- Node version pinada?

### 9. Variáveis de ambiente
```bash
cat .env.example 2>/dev/null
vercel env ls 2>/dev/null | head
```
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `*_API_KEY` presentes em prod?
- `.env*` no `.gitignore`?
- Secrets não comitados em `src/`?

### 10. Bundle & perf
```bash
grep -rn "use client" src/app --include="*.tsx" | wc -l
```
- Componentes "use client" estão minimizados ao necessário?
- Imports dinâmicos para componentes pesados (gráficos, editores)?
- Prisma SELECT explícito (não devolve `password` ou `secret`)?

## Output

Reportar em formato:

```
## 🔴 CRÍTICO (corrigir imediatamente)
- [arquivo:linha] descrição + correção sugerida

## 🟠 ALTO (corrigir essa semana)
- ...

## 🟡 MÉDIO
- ...

## 🔵 OBSERVAÇÃO (melhoria)
- ...

## ✅ OK
Coisas que verifiquei e estão certas (lista resumida).
```

Pra cada achado **CRÍTICO**, dar correção sugerida em 1-3 linhas + arquivo:linha. Não tente corrigir sozinho — só reporte. Se o utilizador pedir "corrige tudo", aí sim.

## NÃO fazer
- Não modifique código nessa skill — só audita
- Não execute migrations
- Não revele credenciais (nem em log)
