export type ThemeKey =
  // Bases
  | "midnight"
  | "daylight"
  | "gamer"
  | "glass"
  | "sunset"
  | "matrix"
  | "ocean"
  | "minimal"
  // Culturais pop
  | "freefire"
  | "fortnite"
  | "simpsons"
  | "bobesponja"
  | "valorant"
  | "steven"
  | "mariobros"
  | "naruto"
  // Pack novo gigante
  | "pharma"
  | "monster"
  | "whisky"
  | "redbull"
  | "money"
  | "policia"
  | "bolsa"
  | "luxocars"
  | "louisvuitton"
  | "gucci"
  | "wallstreet"
  | "lula"
  | "bolsonaro"
  | "praia"
  | "jesus"
  | "saopaulo"
  | "rio"
  | "bahia"
  | "cassino"
  | "miami"
  | "dubai"
  | "rgb"
  | "spotify"
  | "claude"
  | "hellokitty"
  | "copa"
  | "zumbi"
  | "tiktok"
  | "kwai"
  | "google"
  | "csgo"
  | "facebook"
  | "japao"
  | "angola"
  | "africa"
  | "prada"
  | "inferno"
  | "mcdonalds"
  | "67"
  | "trollface"
  | "burgerking"
  | "ibiza"
  | "balada"
  // Pack #3 — comunidades, marcas, memes
  | "adega"
  | "autismo"
  | "anonimos"
  | "down"
  | "macaco"
  | "armas"
  | "leadburro"
  | "camisinha"
  | "cadeirante"
  | "cego"
  | "coco"
  | "doacao"
  | "jardim"
  | "ferrari"
  | "lamborghini"
  | "bitcoin"
  | "solana"
  | "monero"
  | "ghosts"
  | "cadeia"
  | "nike"
  | "cacto"
  | "kiwify"
  | "canetaazul"
  | "robin"
  | "southpark"
  | "apenasumshow"
  | "chaves"
  | "monica"
  | "lacasadepapel"
  | "tiopatinhas"
  | "monalisa"
  | "suits"
  | "breakingbad"
  | "lgbt"
  | "uber"
  | "99pop"
  | "ifood"
  | "atacadao"
  | "motoboy"
  | "natal"
  | "minions"
  | "vector"
  | "joker"
  | "kushdela"
  | "zeny"
  | "thonyecom"
  | "blame"
  | "japa"
  | "davicopy"
  | "jvegudo"
  | "jvmulherengo"
  | "lorecio"
  | "leochicken"
  | "azzi"
  | "renan"
  | "lucasjapa"
  | "henriquedoroi";

export type Theme = {
  key: ThemeKey;
  label: string;
  description: string;
  accent: string;
  preview: {
    bg: string;
    card: string;
    text: string;
    accent: string;
  };
};

export const THEMES: Theme[] = [
  /* ============ BASES ============ */
  { key: "midnight", label: "Midnight", description: "Padrão Trilho. Preto puro + ciano vibrante.", accent: "#22d3ee", preview: { bg: "#050505", card: "#171717", text: "#fafafa", accent: "#22d3ee" } },
  { key: "daylight", label: "Daylight", description: "Light mode profissional. Branco quente + verde escuro.", accent: "#16a34a", preview: { bg: "linear-gradient(135deg, #fafaf9 0%, #f5f5f4 100%)", card: "#ffffff", text: "#0c0a09", accent: "#16a34a" } },
  { key: "gamer", label: "Neon", description: "Roxo+ciano com glow. Vibe RGB neon.", accent: "#d946ef", preview: { bg: "#120025", card: "#1f0a3a", text: "#f5e7ff", accent: "#d946ef" } },
  { key: "glass", label: "Aurora", description: "Aurora boreal vibrante. Violeta + ciano + verde.", accent: "#a855f7", preview: { bg: "linear-gradient(135deg, #0f0524 0%, #1a1f3a 50%, #0a2e3a 100%)", card: "rgba(168, 85, 247, 0.08)", text: "#f0f0ff", accent: "#a855f7" } },
  { key: "sunset", label: "Sunset", description: "Bordô profundo + laranja queimado.", accent: "#f97316", preview: { bg: "#2a0a0a", card: "#3d1410", text: "#fed7aa", accent: "#f97316" } },
  { key: "matrix", label: "Matrix", description: "Hacker mode. Verde fosforescente + mono.", accent: "#00ff41", preview: { bg: "#000000", card: "#001a08", text: "#00ff41", accent: "#00ff41" } },
  { key: "ocean", label: "Ocean", description: "Azul profundo abissal com ciano elétrico.", accent: "#22d3ee", preview: { bg: "#001a2e", card: "#002e4d", text: "#cffafe", accent: "#22d3ee" } },
  { key: "minimal", label: "Mono", description: "Cinza fosco absoluto. Zero saturação.", accent: "#737373", preview: { bg: "#262626", card: "#404040", text: "#fafafa", accent: "#a3a3a3" } },

  /* ============ POP CULTURAIS ============ */
  { key: "freefire", label: "Free Fire 🔥", description: "Laranja chamas + vermelho pixel art. Booyah!", accent: "#FF5722", preview: { bg: "#1A0500", card: "#3D1500", text: "#FFE0B2", accent: "#FF5722" } },
  { key: "fortnite", label: "Fortnite 🎯", description: "Roxo Fortnite + amarelo. Victory Royale.", accent: "#FFD60A", preview: { bg: "#1B0A45", card: "#2E1671", text: "#FFF8C2", accent: "#FFD60A" } },
  { key: "simpsons", label: "Simpsons 🍩", description: "Amarelo Homer + azul Marge. D'oh!", accent: "#FFD90F", preview: { bg: "#1F3A6E", card: "#FFD90F", text: "#1F3A6E", accent: "#3268C8" } },
  { key: "bobesponja", label: "Bob Esponja 🍍", description: "Amarelo esponja + azul Bikini Bottom.", accent: "#FFC107", preview: { bg: "linear-gradient(180deg, #0277BD 0%, #01579B 100%)", card: "rgba(255, 193, 7, 0.12)", text: "#FFF9C4", accent: "#FFC107" } },
  { key: "valorant", label: "Valorant 🎯", description: "Vermelho Valorant + grafite tático.", accent: "#FF4655", preview: { bg: "#0F1923", card: "#1A242F", text: "#ECE8E1", accent: "#FF4655" } },
  { key: "steven", label: "Steven Universe 💎", description: "Pastéis rosa, lilás e ciano. Crystal Gems.", accent: "#FF69B4", preview: { bg: "#1E0F2E", card: "#3A1C5C", text: "#FCE7FF", accent: "#FF69B4" } },
  { key: "mariobros", label: "Mario Bros 🍄", description: "Vermelho Mario + dourado moeda + azul céu.", accent: "#D32F2F", preview: { bg: "linear-gradient(180deg, #1976D2 0%, #0D47A1 100%)", card: "rgba(211, 47, 47, 0.1)", text: "#FFF9C4", accent: "#FBC02D" } },
  { key: "naruto", label: "Naruto 🍥", description: "Laranja Hokage + preto + vermelho Sharingan.", accent: "#FF6B00", preview: { bg: "#0A0A0A", card: "#1F0F00", text: "#FFE0B2", accent: "#FF6B00" } },

  /* ============ NOVO PACK ============ */
  { key: "pharma", label: "Pharma 💊", description: "Cápsulas coloridas estilo farmácia.", accent: "#06b6d4", preview: { bg: "#0a1929", card: "#0e2540", text: "#e0f2fe", accent: "#06b6d4" } },
  { key: "monster", label: "Monster ⚡", description: "Verde elétrico fluorescente. Energético.", accent: "#39FF14", preview: { bg: "#020a02", card: "#0d2a0d", text: "#d0ffd0", accent: "#39FF14" } },
  { key: "whisky", label: "Whisky 🥃", description: "Âmbar quente + couro. Sofisticação.", accent: "#d97706", preview: { bg: "#1a0f04", card: "#2a1810", text: "#fde68a", accent: "#d97706" } },
  { key: "redbull", label: "Red Bull 🐂", description: "Azul + prata + vermelho. Asas.", accent: "#dc2626", preview: { bg: "#0a0e3a", card: "#1a1f4d", text: "#fee2e2", accent: "#dc2626" } },
  { key: "money", label: "Money 💰", description: "Verde dólar + ouro brilhando.", accent: "#15803d", preview: { bg: "#021207", card: "#04210d", text: "#bbf7d0", accent: "#15803d" } },
  { key: "policia", label: "Polícia 🚓", description: "Azul/vermelho sirene + grafite.", accent: "#1e40af", preview: { bg: "#020817", card: "#0a142e", text: "#dbeafe", accent: "#1e40af" } },
  { key: "bolsa", label: "Bolsa 📈", description: "Candlesticks verde/vermelho. Trading.", accent: "#10b981", preview: { bg: "#020617", card: "#0f172a", text: "#d1fae5", accent: "#10b981" } },
  { key: "luxocars", label: "Carros de Luxo 🏎️", description: "Audi + Porsche + BMW. Velocidade.", accent: "#525252", preview: { bg: "#0a0a0a", card: "#171717", text: "#e5e5e5", accent: "#dc2626" } },
  { key: "louisvuitton", label: "Louis Vuitton 👜", description: "Marrom monograma + dourado.", accent: "#92400e", preview: { bg: "#1c0e02", card: "#2e1607", text: "#fef3c7", accent: "#d97706" } },
  { key: "gucci", label: "Gucci 🎀", description: "Verde/vermelho icônico + dourado.", accent: "#dc2626", preview: { bg: "#0a0a0a", card: "#171717", text: "#fef3c7", accent: "#15803d" } },
  { key: "wallstreet", label: "Wolf of Wall Street 🐺", description: "Touros + ursos + charutos + ouro.", accent: "#eab308", preview: { bg: "#0c0a09", card: "#1c1917", text: "#fef9c3", accent: "#eab308" } },
  { key: "lula", label: "Lula 🇧🇷", description: "Vermelho PT + verde/amarelo Brasil.", accent: "#dc2626", preview: { bg: "#7f1d1d", card: "#991b1b", text: "#fef9c3", accent: "#fbbf24" } },
  { key: "bolsonaro", label: "Bolsonaro 🇧🇷", description: "Verde/amarelo + azul Brasil.", accent: "#15803d", preview: { bg: "#022c22", card: "#064e3b", text: "#fef9c3", accent: "#facc15" } },
  { key: "praia", label: "Praia 🏖️", description: "Azul mar + areia dourada + palmeiras.", accent: "#06b6d4", preview: { bg: "linear-gradient(180deg, #38bdf8 0%, #fde68a 100%)", card: "rgba(255,255,255,0.15)", text: "#0c4a6e", accent: "#06b6d4" } },
  { key: "jesus", label: "Jesus Cristo ✝️", description: "Branco celestial + dourado divino.", accent: "#eab308", preview: { bg: "linear-gradient(180deg, #0c4a6e 0%, #f3e8ff 100%)", card: "rgba(250,204,21,0.12)", text: "#fef3c7", accent: "#eab308" } },
  { key: "saopaulo", label: "São Paulo 🏙️", description: "Cinza concreto + neon. Capital paulista.", accent: "#dc2626", preview: { bg: "#18181b", card: "#27272a", text: "#fafafa", accent: "#dc2626" } },
  { key: "rio", label: "Rio de Janeiro 🌴", description: "Azul mar + verde mata + dourado.", accent: "#16a34a", preview: { bg: "linear-gradient(180deg, #0284c7 0%, #16a34a 100%)", card: "rgba(255,255,255,0.1)", text: "#ecfdf5", accent: "#fbbf24" } },
  { key: "bahia", label: "Bahia 🥁", description: "Amarelo sol + verde mata + branco fitas.", accent: "#facc15", preview: { bg: "#7c2d12", card: "#9a3412", text: "#fef3c7", accent: "#facc15" } },
  { key: "cassino", label: "Cassino 🎰", description: "Vermelho/preto + dourado + fichas.", accent: "#dc2626", preview: { bg: "#0a0a0a", card: "#1f0a0a", text: "#fef3c7", accent: "#dc2626" } },
  { key: "miami", label: "Miami 🌴", description: "Neon rosa/azul + art deco.", accent: "#ec4899", preview: { bg: "linear-gradient(135deg, #831843 0%, #1e1b4b 100%)", card: "rgba(236,72,153,0.12)", text: "#fce7f3", accent: "#ec4899" } },
  { key: "dubai", label: "Dubai 🏗️", description: "Dourado areia + arranha-céus.", accent: "#d97706", preview: { bg: "#451a03", card: "#7c2d12", text: "#fef3c7", accent: "#d97706" } },
  { key: "rgb", label: "RGB 🌈", description: "Tudo arco-íris. Texto também.", accent: "#a855f7", preview: { bg: "#0a0a0a", card: "#171717", text: "#ec4899", accent: "#a855f7" } },
  { key: "spotify", label: "Spotify 🎵", description: "Verde Spotify + ondas sonoras.", accent: "#1DB954", preview: { bg: "#191414", card: "#282828", text: "#ffffff", accent: "#1DB954" } },
  { key: "claude", label: "Claude 🦊", description: "Laranja queimado Anthropic.", accent: "#cc785c", preview: { bg: "#1a0f0a", card: "#2a1810", text: "#fed7aa", accent: "#cc785c" } },
  { key: "hellokitty", label: "Hello Kitty 🎀", description: "Rosa bebê + branco + laços.", accent: "#ec4899", preview: { bg: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)", card: "#ffffff", text: "#831843", accent: "#ec4899" } },
  { key: "copa", label: "Copa do Mundo ⚽", description: "Verde gramado + dourado troféu.", accent: "#facc15", preview: { bg: "#14532d", card: "#166534", text: "#fef9c3", accent: "#facc15" } },
  { key: "zumbi", label: "Zumbi 🧟", description: "Verde podre + sangue + lua cheia.", accent: "#0891b2", preview: { bg: "#0a0a05", card: "#1a1a0a", text: "#67e8f9", accent: "#0891b2" } },
  { key: "tiktok", label: "TikTok 🎵", description: "Preto + ciano + magenta. Glitch.", accent: "#ff0050", preview: { bg: "#000000", card: "#0a0a0a", text: "#ffffff", accent: "#ff0050" } },
  { key: "kwai", label: "Kwai 📹", description: "Laranja vibrante + K curva.", accent: "#FF7A00", preview: { bg: "#1a0d00", card: "#2e1700", text: "#ffedd5", accent: "#FF7A00" } },
  { key: "google", label: "Google 🔍", description: "Bolinhas multicolores. Pesquisa.", accent: "#4285F4", preview: { bg: "#ffffff", card: "#f8f9fa", text: "#202124", accent: "#4285F4" } },
  { key: "csgo", label: "CS:GO 🔫", description: "Laranja + cinza tático. AWP.", accent: "#F59E0B", preview: { bg: "#0a0a0a", card: "#1c1917", text: "#fef3c7", accent: "#f59e0b" } },
  { key: "facebook", label: "Facebook 👍", description: "Azul Facebook + branco.", accent: "#1877F2", preview: { bg: "#0f1a2e", card: "#1a2942", text: "#dbeafe", accent: "#1877F2" } },
  { key: "japao", label: "Japão 🗾", description: "Vermelho sol + cerejeira + Fuji.", accent: "#dc2626", preview: { bg: "linear-gradient(180deg, #fecaca 0%, #ffffff 100%)", card: "rgba(220,38,38,0.1)", text: "#7f1d1d", accent: "#dc2626" } },
  { key: "angola", label: "Angola 🇦🇴", description: "Vermelho/preto/amarelo bandeira.", accent: "#dc2626", preview: { bg: "#0a0a0a", card: "#1c1917", text: "#fef3c7", accent: "#facc15" } },
  { key: "africa", label: "África 🦁", description: "Savana laranja + animais.", accent: "#ea580c", preview: { bg: "#451a03", card: "#7c2d12", text: "#fef3c7", accent: "#ea580c" } },
  { key: "prada", label: "Prada 👜", description: "Triângulos prata/preto minimal.", accent: "#a3a3a3", preview: { bg: "#0a0a0a", card: "#1a1a1a", text: "#e5e5e5", accent: "#a3a3a3" } },
  { key: "inferno", label: "Inferno 🔥", description: "Lava vermelha + fumaça + chamas.", accent: "#dc2626", preview: { bg: "linear-gradient(180deg, #450a0a 0%, #000000 100%)", card: "rgba(220,38,38,0.12)", text: "#fecaca", accent: "#dc2626" } },
  { key: "mcdonalds", label: "McDonald's 🍔", description: "Vermelho + dourado arcos.", accent: "#fbbf24", preview: { bg: "#7f1d1d", card: "#991b1b", text: "#fef3c7", accent: "#fbbf24" } },
  { key: "67", label: "Sextou 67 💀", description: "Drill preto + branco glitch.", accent: "#22d3ee", preview: { bg: "#000000", card: "#0a0a0a", text: "#22d3ee", accent: "#22d3ee" } },
  { key: "trollface", label: "Trollface 😏", description: "Memes clássicos. Problem?", accent: "#ffffff", preview: { bg: "#1a1a1a", card: "#2a2a2a", text: "#ffffff", accent: "#ffffff" } },
  { key: "burgerking", label: "Burger King 👑", description: "Laranja + vermelho + coroa.", accent: "#f97316", preview: { bg: "#7c2d12", card: "#9a3412", text: "#fed7aa", accent: "#f97316" } },
  { key: "ibiza", label: "Ibiza 🌅", description: "Pôr-do-sol + balada na praia.", accent: "#ec4899", preview: { bg: "linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)", card: "rgba(0,0,0,0.3)", text: "#fef3c7", accent: "#ec4899" } },
  { key: "balada", label: "Balada 🪩", description: "Luzes RGB + bola de discoteca.", accent: "#a855f7", preview: { bg: "#0a0014", card: "#1a0a2e", text: "#fce7f3", accent: "#a855f7" } },

  /* ============ PACK #3 — comunidades, marcas, memes ============ */
  { key: "adega", label: "Adega Lambada 🍷", description: "Garrafas de vinho + tinto profundo.", accent: "#991b1b", preview: { bg: "#1a0a0a", card: "#2a0e0e", text: "#fecaca", accent: "#991b1b" } },
  { key: "autismo", label: "Autismo ♾️", description: "Infinity arco-íris — apoio à comunidade.", accent: "#a855f7", preview: { bg: "linear-gradient(135deg, #1e1b4b 0%, #831843 100%)", card: "rgba(168,85,247,0.1)", text: "#fce7f3", accent: "#a855f7" } },
  { key: "anonimos", label: "Anonymous 🥷", description: "Ninjas + máscaras de Guy Fawkes.", accent: "#06b6d4", preview: { bg: "#000000", card: "#0a0a0a", text: "#67e8f9", accent: "#06b6d4" } },
  { key: "down", label: "Síndrome de Down 🧦", description: "Lots of Socks — World Down Syndrome Day.", accent: "#ec4899", preview: { bg: "linear-gradient(135deg, #312e81 0%, #831843 100%)", card: "rgba(236,72,153,0.1)", text: "#fce7f3", accent: "#ec4899" } },
  { key: "macaco", label: "Macaco & Banana 🐵", description: "Macacos curiosos + bananas amarelas.", accent: "#fbbf24", preview: { bg: "#451a03", card: "#7c2d12", text: "#fef3c7", accent: "#fbbf24" } },
  { key: "armas", label: "Armas 🔫", description: "Tactical loadout cinza/laranja.", accent: "#ea580c", preview: { bg: "#0a0a0a", card: "#171717", text: "#fed7aa", accent: "#ea580c" } },
  { key: "leadburro", label: "Lead Burro 📱", description: "Pessoas grudadas no celular.", accent: "#06b6d4", preview: { bg: "#020617", card: "#0f172a", text: "#cffafe", accent: "#06b6d4" } },
  { key: "camisinha", label: "Camisinha 💕", description: "Saúde sexual + responsabilidade.", accent: "#ec4899", preview: { bg: "#1a0a14", card: "#2a0e22", text: "#fce7f3", accent: "#ec4899" } },
  { key: "cadeirante", label: "Acessibilidade ♿", description: "Símbolo universal de acessibilidade.", accent: "#3b82f6", preview: { bg: "#0a1929", card: "#0e2540", text: "#bfdbfe", accent: "#3b82f6" } },
  { key: "cego", label: "Cego 🦯", description: "Bengala branca — apoio à comunidade.", accent: "#f59e0b", preview: { bg: "#000000", card: "#0a0a0a", text: "#fef3c7", accent: "#f59e0b" } },
  { key: "coco", label: "Cocô 💩", description: "Pilhas de emoji marrom. Meme.", accent: "#92400e", preview: { bg: "#1c0a01", card: "#2e1607", text: "#fed7aa", accent: "#92400e" } },
  { key: "doacao", label: "Doação ❤️", description: "Corações + mãos. Caridade.", accent: "#dc2626", preview: { bg: "linear-gradient(135deg, #831843 0%, #1e1b4b 100%)", card: "rgba(220,38,38,0.10)", text: "#fce7f3", accent: "#dc2626" } },
  { key: "jardim", label: "Jardim 🌿", description: "Folhas verdes + suculentas.", accent: "#16a34a", preview: { bg: "#022c22", card: "#064e3b", text: "#bbf7d0", accent: "#16a34a" } },
  { key: "ferrari", label: "Ferrari 🏎️", description: "Vermelho racing + cavalo abstrato.", accent: "#dc2626", preview: { bg: "#1a0202", card: "#2a0808", text: "#fecaca", accent: "#dc2626" } },
  { key: "lamborghini", label: "Lamborghini 🐂", description: "Amarelo + verde Aventador.", accent: "#facc15", preview: { bg: "#0a0a0a", card: "#171717", text: "#fef9c3", accent: "#facc15" } },
  { key: "bitcoin", label: "Bitcoin ₿", description: "Laranja BTC + blocos.", accent: "#f97316", preview: { bg: "#1a0d00", card: "#2e1700", text: "#fed7aa", accent: "#f97316" } },
  { key: "solana", label: "Solana ☀️", description: "Gradient roxo/verde/ciano.", accent: "#a855f7", preview: { bg: "linear-gradient(135deg, #581c87 0%, #14532d 100%)", card: "rgba(168,85,247,0.10)", text: "#fce7f3", accent: "#a855f7" } },
  { key: "monero", label: "Monero ɱ", description: "Laranja escuro + privacy.", accent: "#f97316", preview: { bg: "#0a0a0a", card: "#1c1917", text: "#fed7aa", accent: "#f97316" } },
  { key: "ghosts", label: "Ghosts 👻", description: "Fantasmas brancos flutuando.", accent: "#a3a3a3", preview: { bg: "#0a0a0a", card: "#1a1a1a", text: "#f5f5f5", accent: "#a3a3a3" } },
  { key: "cadeia", label: "Cadeia 🔒", description: "Grades + corrente. Sem glória.", accent: "#71717a", preview: { bg: "#0a0a0a", card: "#1c1917", text: "#d4d4d8", accent: "#71717a" } },
  { key: "nike", label: "Nike ✓", description: "Swoosh + Just Do It.", accent: "#0a0a0a", preview: { bg: "#fafafa", card: "#f5f5f5", text: "#0a0a0a", accent: "#0a0a0a" } },
  { key: "cacto", label: "Cacto 🌵", description: "Cactos do deserto.", accent: "#16a34a", preview: { bg: "#1a1209", card: "#2e1f0f", text: "#67e8f9", accent: "#16a34a" } },
  { key: "kiwify", label: "Kiwi 🥝", description: "Verde kiwi + frutas.", accent: "#06b6d4", preview: { bg: "#1a2e0a", card: "#2e4d14", text: "#cffafe", accent: "#06b6d4" } },
  { key: "canetaazul", label: "Caneta Azul 🖊️", description: "Canetas azuis (música ON).", accent: "#1e40af", preview: { bg: "#0f1a2e", card: "#1a2942", text: "#dbeafe", accent: "#1e40af" } },
  { key: "robin", label: "Robin 🦸", description: "Verde + vermelho + amarelo.", accent: "#facc15", preview: { bg: "#0a0a0a", card: "#171717", text: "#fef9c3", accent: "#facc15" } },
  { key: "southpark", label: "South Park ❄️", description: "Bonecos coloridos + cachecol.", accent: "#dc2626", preview: { bg: "linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%)", card: "rgba(0,0,0,0.06)", text: "#0a0a0a", accent: "#dc2626" } },
  { key: "apenasumshow", label: "Apenas um Show 🐦", description: "Mordecai e Rigby. Azul + marrom.", accent: "#3b82f6", preview: { bg: "#0a1929", card: "#0e2540", text: "#bae6fd", accent: "#3b82f6" } },
  { key: "chaves", label: "Chaves 🍺", description: "Vila do Chaves + barril.", accent: "#facc15", preview: { bg: "#451a03", card: "#7c2d12", text: "#fef3c7", accent: "#facc15" } },
  { key: "monica", label: "Turma da Mônica 🐰", description: "Vermelho Mônica + verde Cebolinha.", accent: "#dc2626", preview: { bg: "#fef2f2", card: "#fee2e2", text: "#7f1d1d", accent: "#dc2626" } },
  { key: "lacasadepapel", label: "La Casa de Papel 🎭", description: "Macacão vermelho + Dalí.", accent: "#dc2626", preview: { bg: "#0a0a0a", card: "#1f0a0a", text: "#fecaca", accent: "#dc2626" } },
  { key: "tiopatinhas", label: "Tio Patinhas 🦆", description: "Cartola + cofre + moedas.", accent: "#fbbf24", preview: { bg: "#0a1929", card: "#0e2540", text: "#fef3c7", accent: "#fbbf24" } },
  { key: "monalisa", label: "Mona Lisa 🖼️", description: "Arte clássica + dourado.", accent: "#a16207", preview: { bg: "#1a0f04", card: "#2a1810", text: "#fde68a", accent: "#a16207" } },
  { key: "suits", label: "Suits ⚖️", description: "Advogados + maletas + ternos.", accent: "#1e40af", preview: { bg: "#0a0a0a", card: "#0a142e", text: "#dbeafe", accent: "#1e40af" } },
  { key: "breakingbad", label: "Breaking Bad 🧪", description: "Hazmat amarelo + cristal azul.", accent: "#facc15", preview: { bg: "#022c22", card: "#064e3b", text: "#fef9c3", accent: "#facc15" } },
  { key: "lgbt", label: "LGBTQIA+ 🏳️‍🌈", description: "Bandeira arco-íris + corações.", accent: "#a855f7", preview: { bg: "linear-gradient(135deg, #831843 0%, #1e1b4b 50%, #14532d 100%)", card: "rgba(168,85,247,0.10)", text: "#fce7f3", accent: "#a855f7" } },
  { key: "uber", label: "Uber 🚗", description: "Preto + branco + carros.", accent: "#0a0a0a", preview: { bg: "#fafafa", card: "#f5f5f5", text: "#0a0a0a", accent: "#0a0a0a" } },
  { key: "99pop", label: "99 🚕", description: "Amarelo + preto.", accent: "#facc15", preview: { bg: "#0a0a0a", card: "#171717", text: "#fef9c3", accent: "#facc15" } },
  { key: "ifood", label: "iFood 🍔", description: "Vermelho + pratos + delivery.", accent: "#dc2626", preview: { bg: "#7f1d1d", card: "#991b1b", text: "#fef3c7", accent: "#dc2626" } },
  { key: "atacadao", label: "Atacadão 🛒", description: "Carrinhos + caixas + preço baixo.", accent: "#dc2626", preview: { bg: "#7f1d1d", card: "#991b1b", text: "#fef9c3", accent: "#fbbf24" } },
  { key: "motoboy", label: "Motoboy 🏍️", description: "Motos + capacetes + delivery.", accent: "#dc2626", preview: { bg: "#0a0a0a", card: "#171717", text: "#fecaca", accent: "#dc2626" } },
  { key: "natal", label: "Natal 🎄", description: "Pinheiro + neve + presentes.", accent: "#dc2626", preview: { bg: "#022c22", card: "#064e3b", text: "#fecaca", accent: "#dc2626" } },
  { key: "minions", label: "Minions 🍌", description: "Amarelo + óculos + bananas.", accent: "#facc15", preview: { bg: "#1a1209", card: "#2a1f0e", text: "#fef9c3", accent: "#facc15" } },
  { key: "vector", label: "Vector 🍑", description: "Macacão laranja + óculos + DIRECTIONS.", accent: "#f97316", preview: { bg: "#1a0d00", card: "#2e1700", text: "#fed7aa", accent: "#f97316" } },
  { key: "joker", label: "Coringa 🃏", description: "Roxo + verde ácido. Why so serious?", accent: "#a855f7", preview: { bg: "#1a0a2e", card: "#2e0a4a", text: "#bbf7d0", accent: "#22c55e" } },
  { key: "kushdela", label: "Kush Dela 💎", description: "Mordecai + lifestyle worldwide. $$$.", accent: "#3b82f6", preview: { bg: "#0a1733", card: "#152a52", text: "#dbeafe", accent: "#fbbf24" } },
  { key: "zeny", label: "Zeny 🐀", description: "Rigby + cybersecurity swag. Life's a Trip.", accent: "#dc2626", preview: { bg: "#1a0a0a", card: "#2a1010", text: "#fecaca", accent: "#22c55e" } },
  { key: "thonyecom", label: "Thony Ecom 🕷️", description: "Homem-Aranha Black. Simbionte + teias.", accent: "#fafafa", preview: { bg: "#000000", card: "#0a0a0a", text: "#fafafa", accent: "#fafafa" } },
  { key: "blame", label: "Blame ⚡", description: "Monster White. Gelo + raios azuis.", accent: "#3b82f6", preview: { bg: "#020617", card: "#0f172a", text: "#dbeafe", accent: "#3b82f6" } },
  { key: "japa", label: "Japa Luca 🇯🇵", description: "Bandeiras do Japão + Toyota Fielder.", accent: "#dc2626", preview: { bg: "#1a0a0a", card: "#2a0e0e", text: "#fee2e2", accent: "#dc2626" } },
  { key: "davicopy", label: "davi.copy 👑", description: "Copy master. Notificações PIX + gráficos subindo + palavras de poder.", accent: "#f59e0b", preview: { bg: "#050a08", card: "#0a1a14", text: "#fef3c7", accent: "#f59e0b" } },
  { key: "jvegudo", label: "Jv Egudo 🏆", description: "Top 1. Troféus + #01 + dinheiro + ego no talo.", accent: "#facc15", preview: { bg: "#0a0a05", card: "#1a1a08", text: "#fef9c3", accent: "#facc15" } },
  { key: "jvmulherengo", label: "Jv Mulherengo 💋", description: "Mesmo cara, mulheres diferentes (ruivas, loiras, morenas).", accent: "#ec4899", preview: { bg: "#1a0a14", card: "#2a0e22", text: "#fce7f3", accent: "#ec4899" } },
  { key: "lorecio", label: "Lorecio 👼", description: "Anjos loiros + pesos de academia + músculos.", accent: "#fbbf24", preview: { bg: "#0a1029", card: "#152042", text: "#fef3c7", accent: "#fbbf24" } },
  { key: "leochicken", label: "Leo Chicken 🍗", description: "Galinhas + cara loiro + bebidas alcoólicas.", accent: "#f97316", preview: { bg: "#1a0d00", card: "#2e1700", text: "#fed7aa", accent: "#f97316" } },
  { key: "azzi", label: "Azzi 💸", description: "Carro batido + mulheres + saque de R$ 1 milhão.", accent: "#10b981", preview: { bg: "#020817", card: "#0a142e", text: "#bbf7d0", accent: "#10b981" } },
  { key: "renan", label: "Renan 🕶️", description: "Homem de óculos + mulheres + dinheiro + armas.", accent: "#525252", preview: { bg: "#0a0a0a", card: "#171717", text: "#e5e5e5", accent: "#525252" } },
  { key: "lucasjapa", label: "Lucas Japa v2 🗾", description: "Bandeiras do Japão + saque R$ 1M no celular + dinheiro.", accent: "#dc2626", preview: { bg: "#1a0a0a", card: "#2a0e0e", text: "#fee2e2", accent: "#dc2626" } },
  { key: "henriquedoroi", label: "Henrique do Roi 🏎️", description: "Vários logos BMW espalhados + azul BMW + prata premium.", accent: "#1c69d4", preview: { bg: "#050a14", card: "#0a1428", text: "#dbeafe", accent: "#1c69d4" } },
];

export function getTheme(key: string): Theme {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}

/* ============ CATEGORIAS ============ */

export type ThemeCategory =
  | "basicos"
  | "games"
  | "desenhos"
  | "filmes"
  | "marcas"
  | "luxo"
  | "dinheiro"
  | "lugares"
  | "brasil"
  | "causas"
  | "diversos"
  | "creators";

/** Ordem + rótulo das categorias na UI (seletor de temas). */
export const THEME_CATEGORY_ORDER: { key: ThemeCategory; label: string }[] = [
  { key: "basicos", label: "Básicos & Efeitos" },
  { key: "marcas", label: "Marcas & Apps" },
  { key: "games", label: "Games" },
  { key: "desenhos", label: "Desenhos & Anime" },
  { key: "filmes", label: "Filmes & Séries" },
  { key: "luxo", label: "Carros & Luxo" },
  { key: "dinheiro", label: "Dinheiro & Cripto" },
  { key: "lugares", label: "Lugares & Viagem" },
  { key: "brasil", label: "Brasil & Política" },
  { key: "causas", label: "Causas, Fé & Comunidades" },
  { key: "diversos", label: "Memes & Diversos" },
  { key: "creators", label: "Creators" },
];

/**
 * Categoria de cada tema. É um Record EXAUSTIVO sobre ThemeKey — o TS recusa
 * compilar se algum tema novo ficar sem categoria, então nenhum tema some do
 * seletor sem querer.
 */
export const THEME_CATEGORY: Record<ThemeKey, ThemeCategory> = {
  // Básicos & efeitos
  midnight: "basicos",
  daylight: "basicos",
  gamer: "basicos",
  glass: "basicos",
  sunset: "basicos",
  matrix: "basicos",
  ocean: "basicos",
  minimal: "basicos",
  rgb: "basicos",
  inferno: "basicos",
  balada: "basicos",
  // Marcas & apps
  monster: "marcas",
  redbull: "marcas",
  blame: "marcas",
  louisvuitton: "marcas",
  gucci: "marcas",
  prada: "marcas",
  nike: "marcas",
  spotify: "marcas",
  claude: "marcas",
  tiktok: "marcas",
  kwai: "marcas",
  google: "marcas",
  facebook: "marcas",
  mcdonalds: "marcas",
  burgerking: "marcas",
  kiwify: "marcas",
  uber: "marcas",
  "99pop": "marcas",
  ifood: "marcas",
  atacadao: "marcas",
  hellokitty: "marcas",
  // Games
  freefire: "games",
  fortnite: "games",
  valorant: "games",
  mariobros: "games",
  csgo: "games",
  // Desenhos & anime
  simpsons: "desenhos",
  bobesponja: "desenhos",
  steven: "desenhos",
  naruto: "desenhos",
  southpark: "desenhos",
  apenasumshow: "desenhos",
  chaves: "desenhos",
  monica: "desenhos",
  minions: "desenhos",
  vector: "desenhos",
  robin: "desenhos",
  kushdela: "desenhos",
  zeny: "desenhos",
  // Filmes & séries
  joker: "filmes",
  lacasadepapel: "filmes",
  suits: "filmes",
  breakingbad: "filmes",
  wallstreet: "filmes",
  monalisa: "filmes",
  // Carros & luxo
  luxocars: "luxo",
  ferrari: "luxo",
  lamborghini: "luxo",
  whisky: "luxo",
  // Dinheiro & cripto
  money: "dinheiro",
  bolsa: "dinheiro",
  cassino: "dinheiro",
  bitcoin: "dinheiro",
  solana: "dinheiro",
  monero: "dinheiro",
  tiopatinhas: "dinheiro",
  // Lugares & viagem
  praia: "lugares",
  saopaulo: "lugares",
  rio: "lugares",
  bahia: "lugares",
  miami: "lugares",
  dubai: "lugares",
  japao: "lugares",
  angola: "lugares",
  africa: "lugares",
  ibiza: "lugares",
  // Brasil & política
  lula: "brasil",
  bolsonaro: "brasil",
  copa: "brasil",
  // Causas, fé & comunidades
  jesus: "causas",
  autismo: "causas",
  down: "causas",
  cadeirante: "causas",
  cego: "causas",
  lgbt: "causas",
  doacao: "causas",
  camisinha: "causas",
  // Memes & diversos
  pharma: "diversos",
  policia: "diversos",
  zumbi: "diversos",
  "67": "diversos",
  trollface: "diversos",
  adega: "diversos",
  anonimos: "diversos",
  macaco: "diversos",
  armas: "diversos",
  leadburro: "diversos",
  coco: "diversos",
  jardim: "diversos",
  ghosts: "diversos",
  cadeia: "diversos",
  cacto: "diversos",
  canetaazul: "diversos",
  motoboy: "diversos",
  natal: "diversos",
  // Creators
  thonyecom: "creators",
  japa: "creators",
  davicopy: "creators",
  jvegudo: "creators",
  jvmulherengo: "creators",
  lorecio: "creators",
  leochicken: "creators",
  azzi: "creators",
  renan: "creators",
  lucasjapa: "creators",
  henriquedoroi: "creators",
};

/** Categoria de um tema (fallback "diversos" se a key for desconhecida). */
export function themeCategory(key: string): ThemeCategory {
  return THEME_CATEGORY[key as ThemeKey] ?? "diversos";
}

export const BG_PATTERNS = [
  { key: "grid", label: "Grid" },
  { key: "dots", label: "Dots" },
  { key: "noise", label: "Noise" },
  { key: "waves", label: "Waves" },
  { key: "mesh", label: "Mesh" },
  { key: "none", label: "Sem padrão" },
] as const;

export type BgPattern = (typeof BG_PATTERNS)[number]["key"];
