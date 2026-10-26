---
name: create-theme
description: Cria um novo tema visual para o Trilho (cena SVG + CSS + registro). Use sempre que o utilizador pedir "criar tema X" ou "fazer um tema chamado X". Passos automáticos: registra no `src/lib/themes.ts`, escreve primitivos SVG e cena cinematográfica em `src/components/theme-scenes-special.ts`, adiciona CSS dedicado em `src/styles/themes.css`. NÃO commita nem deploya sozinho — só implementa.
---

# Criar Tema Trilho

## Inputs esperados do utilizador
- Nome do tema (ex: "Davi Copy", "Tony Ecom")
- Elementos visuais (ex: "anjos loiros + pesos + bíceps", "bandeiras do Japão + dinheiro")
- Paleta opcional (se não, escolho baseado no conceito)

## Inferência da chave
Converta o nome em `camelCase` minúsculo, removendo acentos/pontos:
- "Tony Ecom" → `tonyecom`
- "davi.copy" → `davicopy`
- "Jv Mulherengo" → `jvmulherengo`
- "Tiltado Zampierre" → `tiltado`

## Passos obrigatórios

### 1. `src/lib/themes.ts`
1. Adicione a chave no union `ThemeKey` (no fim do bloco que termina com `;`)
2. Adicione um objeto no array `THEMES` no fim (antes do `]`) com:
   - `key`, `label`, `description`, `accent`, `preview: {bg,card,text,accent}`
   - **Importante**: emoji no `label` para visual no picker

### 2. `src/components/theme-scenes-special.ts`
1. Crie os primitivos SVG **antes** do bloco `/* ============== SCENES ============== */`
2. Cada SVG deve:
   - Ter `viewBox` próprio
   - Usar `xmlns="http://www.w3.org/2000/svg"`
   - Usar IDs únicos em `<defs>` (prefixe com algo curto do tema para evitar colisão entre temas)
   - Ser auto-suficiente (sem dependência externa)
3. Adicione a cena no fim do objeto `SCENES_SPECIAL` (antes do `};` final):
   ```ts
   <chave>: {
     gradient: "radial-gradient(...), linear-gradient(...)",
     elements: [
       // 50-80 elementos em camadas
       // 1. Background gigante (1 elemento opacity baixa, anim 0)
       // 2. Figura âncora nos cantos (pin: "bottom-left", "bottom-right")
       // 3. Figura central grande (anim 0)
       // 4. Variantes médias com rotate -20 a +20
       // 5. Detalhes pequenos espalhados
     ],
   },
   ```
4. **NUNCA** reutilize chave de outro tema. Use `Record<string, Scene>`.

### 3. `src/styles/themes.css`
Adicione um bloco no fim do arquivo:
```css
[data-theme="<chave>"] {
  --bp-bg: <hex>;
  --bp-card: rgba(<rgb>,0.10);
  --bp-fg: <hex>;
  --bp-accent: <hex>;
  --bp-accent-soft: rgba(<rgb>,0.22);
  background:
    /* opcional: url("data:image/svg+xml;utf8,...") tileable */
    radial-gradient(circle at 30% 25%, rgba(<rgb>,0.30), transparent 50%),
    radial-gradient(circle at 70% 75%, rgba(<rgb2>,0.22), transparent 55%),
    linear-gradient(180deg, <hex1> 0%, <hex2> 100%) !important;
  background-attachment: fixed, fixed, fixed !important; /* uma "fixed" por camada */
}
[data-theme="<chave>"] .text-lime-300,
[data-theme="<chave>"] .text-lime-400 {
  color: <accent> !important;
  text-shadow: 0 0 10px rgba(<accent-rgb>,0.7);
}
[data-theme="<chave>"] .bg-lime-400 {
  background: linear-gradient(135deg, <c1> 0%, <c2> 100%) !important;
  color: <fg> !important;
}
[data-theme="<chave>"] .bg-white\/\[0\.02\],
[data-theme="<chave>"] .bg-white\/\[0\.03\],
[data-theme="<chave>"] .bg-white\/\[0\.04\],
[data-theme="<chave>"] .bg-white\/\[0\.06\] {
  background-color: rgba(<bg-rgb>,0.92) !important;
  backdrop-filter: blur(10px);
}
[data-theme="<chave>"] .border-lime-400\/20,
[data-theme="<chave>"] .border-lime-400\/30,
[data-theme="<chave>"] .border-lime-400\/40 {
  border-color: rgba(<accent-rgb>,0.5) !important;
}
```

## Boas práticas estéticas

### Layout cinematográfico (8+ camadas)
Não jogue ícones soltos. Cada cena deve ter hierarquia:
1. **Background gigante** (1 elemento de 400-600px com opacity 0.06-0.15)
2. **Âncoras nos cantos** (`pin: "bottom-left"`, `pin: "bottom-right"`)
3. **Figura central** (200-340px, opacity 0.92-0.96)
4. **Médias laterais** (4-6 elementos em rotações de -22° a +22°)
5. **Padrão de fundo** em CSS via SVG tileable (URL-encoded) com 8-12% opacity
6. **Cards com `backdrop-filter: blur` e bg opaco** para não competir com o tema

### Reutilização
Antes de criar um SVG, verifique se já existe um adequado:
- `HUNDRED_BILL` (US$100 dourado)
- `BLUE_BILL` (US$100 azul)
- `WOMAN_REDHEAD`, `WOMAN_BLONDE`, `WOMAN_BRUNETTE`
- `SAME_GUY`, `BLONDE_GUY`, `GUY_GLASSES`
- `JAPAN_FLAG`, `JAPAN_FLAG_WAVY`, `JAPAN_FLAG_POLE`, `SAKURA`
- `AUDI_RINGS_BLUE`, `AUDI_CAR_BLUE`, `AUDI_SUV_SILVER`
- `FIELDER_WAGON`, `FIELDER_SILVER`, `TOYOTA_LOGO`
- `TROPHY`, `GOLD_MEDAL`, `KING_CROWN`, `GOLDEN_DOLLAR`, `NUMBER_01`, `LAUREL_WREATH`
- `PHONE_PIX`, `PHONE_MILLION`, `PIX_NOTIFICATION`, `CHECKOUT_CARD`
- `FIRE_ICON`, `TIKTOK_LOGO`, `SMOKE_PUFF`, `VAPE_DEVICE`, `BURGER`
- `CHICKEN`, `BEER_BOTTLE`, `WHISKY_GLASS`, `BEER_MUG`
- `CRASHED_CAR`, `RED_SPORTS_CAR`, `YELLOW_LAMBO`, `GUN_PISTOL`
- `PINK_HEART`, `LIPSTICK_KISS`, `ANGEL_BLONDE`, `DUMBBELL`, `MUSCLE_ARM`
- `PLANT_LEAF`, `POTTED_PLANT`

### Performance
- SVG inline, sem requests externos
- Nunca exceda 100 elementos por cena (custa render)
- `anim: 0..3` rotaciona qual variação de animação CSS usar
- `opacity` < 0.20 só para background atmosférico; foreground > 0.85

## Verificação final
Após editar os 3 arquivos:
1. `npx tsc --noEmit` (não devolva erros novos)
2. Reportar ao utilizador: chave, label, contagem de SVGs novos, contagem de elementos na cena, paleta usada
3. NÃO commitar/deployar — a skill `deploy-trilho` é separada
