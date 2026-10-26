---
name: deploy-trilho
description: Commit local + deploy do Trilho Pagamentos pra produção via Vercel CLI. Use sempre que o utilizador pedir "deploy", "manda pra produção", "sobe agora", "deploy rápido" após qualquer alteração. Cria commit descritivo e roda o deploy, aguardando terminar.
---

# Deploy Rápido Trilho Pagamentos

## Setup
- **Path**: `/Users/macbookpro/Downloads/trilhopag`
- **Branch principal**: `main`
- **Git**: repositório LOCAL, sem remote. Não existe `git push` nem GitHub Actions.
- **CI/CD**: deploy direto pela Vercel CLI (o `.github/workflows/deploy.yml` é herdado e está inerte)
- **Vercel team**: `trilho-pag` (`team_50UEHKbxkfDtLxmDfFdvQkwo`)
- **Project**: `trilhopag` (`prj_fACaJTiAuHsE8oPKJw66I22MIWzk`)
- **Domínio**: `trilhopag.com`

## Passos OBRIGATÓRIOS

### 1. Verificar estado
```bash
cd /Users/macbookpro/Downloads/trilhopag && git status
```

Se não houver mudanças staged/unstaged + untracked relevantes, NÃO criar commit vazio. Reportar "nada a deployar" e parar.

### 2. Mensagem de commit
Analise as mudanças (`git diff --stat`, `git status`). Use o padrão:
```
<tipo>(<escopo>): <resumo curto>

<corpo opcional explicando contexto/decisões>
```

Tipos:
- `feat`: nova feature
- `fix`: bug fix
- `chore`: manutenção
- `refactor`: refactor sem mudança de comportamento
- `style`: tema/CSS apenas
- `docs`: documentação

Exemplos:
- `feat(themes): novo tema "kaue escaludo"`
- `fix(checkout): corrige race condition no PIX`
- `style(sidebar): aba Suporte adicionada`

### 3. Commit
```bash
git add -A
git commit -m "$(cat <<'EOF'
<mensagem>
EOF
)"
```

Nunca use `--no-verify` (pre-commit hooks devem rodar).
**NUNCA** use `--amend` se o commit já foi deployado.

### 4. Build local antes de subir
O deploy sobe o source, então um build quebrado só falha lá na Vercel.
Vale rodar antes:
```bash
npx tsc --noEmit && npm run build 2>&1 | tail -20
```

### 5. Deploy
```bash
npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" 2>&1 | tail -20
```

O comando bloqueia até o build terminar e imprime a URL final.

### 6. Reportar
- Hash do commit (`git log -1 --format=%h`)
- URL de produção: `https://trilhopag.com`
- Status: success/failure + duração
- Se houver mudanças relevantes pro usuário testar (rotas novas, temas, fluxos), liste em bullets curtos

## Safety
- **NUNCA** deployar sem que o utilizador tenha pedido
- **NUNCA** suba `.env*`, `*.key`, `*.pem` — verificar `git status` antes
- Se pre-commit hook falhar → fix o problema, **novo commit** (não amend)
- Se build da Vercel falhar → ler o log do output, reportar erro ao utilizador
- Confirmar que `deployment-guard.ts` aponta pro projeto do Trilho antes de deployar
