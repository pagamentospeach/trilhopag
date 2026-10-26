"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  Loader2,
  Trash2,
  Plus,
  GraduationCap,
  Users,
  Palette,
  Package,
  ExternalLink,
  Copy,
  Check,
  FileVideo,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import {
  updateMemberArea,
  deleteMemberArea,
  createCategory,
  createCourse,
  deleteCourse,
  createModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
  linkProductToMemberArea,
  unlinkProductFromMemberArea,
} from "../actions";

type Area = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  heroImageUrl: string | null;
  heroTagline: string | null;
  customDomain: string | null;
  requireLogin: boolean;
  active: boolean;
  memberCount: number;
};

type Course = {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  categoryId: string | null;
  dripDay: number;
  sortOrder: number;
  modules: Array<{
    id: string;
    title: string;
    sortOrder: number;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      contentUrl: string | null;
      durationSec: number | null;
      dripDay: number | null;
      sortOrder: number;
    }>;
  }>;
};

export function MemberAreaEditor({
  area: initial,
  categories: initialCategories,
  courses: initialCourses,
  linkedProducts,
  allProducts,
}: {
  area: Area;
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  courses: Course[];
  linkedProducts: Array<{ id: string; name: string; slug: string }>;
  allProducts: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [a, setA] = useState<Area>(initial);
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"design" | "cursos" | "produtos" | "alunos">(
    "cursos",
  );
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function update<K extends keyof Area>(k: K, v: Area[K]) {
    setA((s) => ({ ...s, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      const r = await updateMemberArea({
        id: a.id,
        name: a.name,
        description: a.description,
        logoUrl: a.logoUrl,
        primaryColor: a.primaryColor,
        accentColor: a.accentColor,
        backgroundColor: a.backgroundColor,
        heroImageUrl: a.heroImageUrl,
        heroTagline: a.heroTagline,
        requireLogin: a.requireLogin,
        active: a.active,
      });
      if (r.ok) {
        setSavedMsg("Salvo!");
        setTimeout(() => setSavedMsg(null), 2000);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm("Apagar esta área? Não dá pra desfazer.")) return;
    startTransition(async () => {
      const r = await deleteMemberArea(a.id);
      if (r.ok) router.push("/dashboard/membros");
    });
  }

  const publicUrl = `https://trilhopag.com/m/${a.slug}`;
  function copyUrl() {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link
        href="/dashboard/membros"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
      >
        <ChevronLeft className="size-3" /> Voltar pras áreas
      </Link>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <input
            value={a.name}
            onChange={(e) => update("name", e.target.value)}
            className="bg-transparent text-2xl font-semibold text-white outline-none border-b border-transparent hover:border-white/[0.06] focus:border-cyan-400 transition w-full max-w-md"
          />
          <p className="text-[11px] text-zinc-500 mt-1 font-mono">slug: {a.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={a.active}
              onChange={(e) => update("active", e.target.checked)}
              className="size-4 rounded border-white/[0.12] bg-white/[0.04] text-cyan-400"
            />
            Ativa
          </label>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15 disabled:opacity-50"
          >
            <Trash2 className="size-3" /> Excluir
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            {savedMsg ?? "Salvar"}
          </button>
        </div>
      </div>

      {/* URL pública */}
      <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.05] p-5">
        <p className="text-xs text-zinc-400 mb-2">URL pública da área:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-black/40 px-3 py-2 text-sm text-cyan-300 font-mono break-all">
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs font-medium transition ${
              copied
                ? "bg-cyan-400 text-black"
                : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12]"
            }`}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.12]"
          >
            <ExternalLink className="size-3" /> Abrir
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] overflow-x-auto">
        {(
          [
            { key: "cursos", label: "Cursos & Aulas", icon: GraduationCap },
            { key: "design", label: "Design", icon: Palette },
            { key: "produtos", label: "Acesso (Produtos)", icon: Package },
            { key: "alunos", label: `Alunos (${a.memberCount})`, icon: Users },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "design" && (
        <DesignTab area={a} update={update} />
      )}

      {tab === "cursos" && (
        <CursosTab
          areaId={a.id}
          courses={initialCourses}
          categories={initialCategories}
        />
      )}

      {tab === "produtos" && (
        <ProdutosTab
          areaId={a.id}
          linked={linkedProducts}
          all={allProducts}
        />
      )}

      {tab === "alunos" && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <Users className="mx-auto size-10 text-zinc-600" />
          <p className="mt-4 text-base font-semibold text-white">
            Lista de alunos
          </p>
          <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
            Quando alguém comprar um produto vinculado, ele aparece aqui
            automaticamente. Total atual: {a.memberCount} aluno(s).
          </p>
        </div>
      )}
    </div>
  );
}

/* ============ DESIGN TAB ============ */
function DesignTab({
  area,
  update,
}: {
  area: Area;
  update: <K extends keyof Area>(k: K, v: Area[K]) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
      <SectionTitle>Identidade visual</SectionTitle>
      <UrlRow
        label="Logo URL (substitui o nome no topo)"
        value={area.logoUrl}
        onChange={(s) => update("logoUrl", s)}
      />
      <UrlRow
        label="Banner Hero (banner grande no topo da área)"
        value={area.heroImageUrl}
        onChange={(s) => update("heroImageUrl", s)}
      />
      <TextRow
        label="Tagline do Hero"
        value={area.heroTagline ?? ""}
        onChange={(s) => update("heroTagline", s || null)}
        placeholder="Sua jornada começa aqui"
      />
      <TextRow
        label="Descrição"
        value={area.description ?? ""}
        onChange={(s) => update("description", s || null)}
        placeholder="O que o aluno vai aprender..."
      />

      <SectionTitle>Cores</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <ColorRow
          label="Primária (CTAs)"
          value={area.primaryColor}
          onChange={(c) => update("primaryColor", c)}
        />
        <ColorRow
          label="Acento (gradientes)"
          value={area.accentColor}
          onChange={(c) => update("accentColor", c)}
        />
        <ColorRow
          label="Fundo"
          value={area.backgroundColor}
          onChange={(c) => update("backgroundColor", c)}
        />
      </div>

      <SectionTitle>Domínio customizado</SectionTitle>
      <TextRow
        label="CNAME do seu domínio (ex: membros.seudominio.com)"
        value={area.customDomain ?? ""}
        onChange={(s) => update("customDomain", s || null)}
        placeholder="membros.seudominio.com"
      />
      <p className="text-[11px] text-zinc-500 -mt-2">
        Aponte um CNAME pro <code className="text-cyan-300">trilhopag.com</code>.
      </p>

      <SectionTitle>Acesso</SectionTitle>
      <ToggleRow
        label="Exigir login pra acessar"
        help="Desligado = qualquer um vê o conteúdo (modo público)"
        checked={area.requireLogin}
        onChange={(c) => update("requireLogin", c)}
      />
    </div>
  );
}

/* ============ CURSOS TAB ============ */
function CursosTab({
  areaId,
  courses,
  categories,
}: {
  areaId: string;
  courses: Course[];
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  function addCourse() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      await createCourse({ memberAreaId: areaId, title: newTitle.trim() });
      setNewTitle("");
      router.refresh();
    });
  }
  function addCategory() {
    if (!newCategoryName.trim()) return;
    startTransition(async () => {
      await createCategory(areaId, newCategoryName.trim());
      setNewCategoryName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Quick add cursos */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <SectionTitle>Adicionar curso</SectionTitle>
        <div className="flex gap-2 mt-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCourse()}
            placeholder="Título do curso..."
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
          <button
            type="button"
            onClick={addCourse}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300"
          >
            <Plus className="size-3.5" /> Adicionar
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-white/[0.04]">
          <p className="text-[10px] uppercase text-zinc-500 mb-2">Categorias</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 text-xs text-zinc-200"
              >
                {c.name}
              </span>
            ))}
            <div className="inline-flex items-center gap-1">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                placeholder="Nova categoria"
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 w-32"
              />
              <button
                type="button"
                onClick={addCategory}
                className="p-1 rounded-full text-cyan-300 hover:bg-white/[0.06]"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de cursos */}
      {courses.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-zinc-500">
          Nenhum curso ainda. Adicione um acima.
        </div>
      ) : (
        courses.map((c) => <CourseCard key={c.id} course={c} />)
      )}
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [newModule, setNewModule] = useState("");

  function addModule() {
    if (!newModule.trim()) return;
    startTransition(async () => {
      await createModule(course.id, newModule.trim());
      setNewModule("");
      router.refresh();
    });
  }
  function handleDelete() {
    if (!confirm(`Apagar o curso "${course.title}"?`)) return;
    startTransition(async () => {
      await deleteCourse(course.id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-zinc-500 hover:text-white"
        >
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <GraduationCap className="size-4 text-cyan-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{course.title}</p>
          <p className="text-[11px] text-zinc-500">
            {course.modules.length} módulo(s) ·{" "}
            {course.modules.reduce((s, m) => s + m.lessons.length, 0)} aula(s)
            {course.dripDay > 0 && ` · liberado em ${course.dripDay} dia(s)`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="p-1.5 rounded-md text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-3">
          {course.modules.map((m) => (
            <ModuleBlock key={m.id} module={m} />
          ))}

          <div className="flex gap-2 pt-2">
            <input
              value={newModule}
              onChange={(e) => setNewModule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addModule()}
              placeholder="Adicionar módulo..."
              className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={addModule}
              className="rounded-md bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.12]"
            >
              <Plus className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModuleBlock({
  module: m,
}: {
  module: {
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      contentUrl: string | null;
      durationSec: number | null;
      dripDay: number | null;
    }>;
  };
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonUrl, setNewLessonUrl] = useState("");

  function addLesson() {
    if (!newLessonTitle.trim()) return;
    startTransition(async () => {
      await createLesson({
        moduleId: m.id,
        title: newLessonTitle.trim(),
        type: "video",
        contentUrl: newLessonUrl.trim() || null,
      });
      setNewLessonTitle("");
      setNewLessonUrl("");
      router.refresh();
    });
  }
  function deleteModuleClick() {
    if (!confirm("Apagar este módulo e suas aulas?")) return;
    startTransition(async () => {
      await deleteModule(m.id);
      router.refresh();
    });
  }
  function deleteLessonClick(id: string) {
    if (!confirm("Apagar esta aula?")) return;
    startTransition(async () => {
      await deleteLesson(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-zinc-200 flex-1">{m.title}</p>
        <button
          type="button"
          onClick={deleteModuleClick}
          className="p-1 rounded-md text-zinc-500 hover:text-red-300"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      {m.lessons.length > 0 && (
        <ul className="space-y-1 mb-2">
          {m.lessons.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded bg-white/[0.02] px-2 py-1.5 text-xs"
            >
              <FileVideo className="size-3 text-zinc-500" />
              <span className="text-zinc-300 flex-1 truncate">{l.title}</span>
              {l.dripDay !== null && l.dripDay !== 0 && (
                <span className="text-[10px] text-yellow-300">
                  +{l.dripDay}d
                </span>
              )}
              <button
                type="button"
                onClick={() => deleteLessonClick(l.id)}
                className="p-0.5 text-zinc-500 hover:text-red-300"
              >
                <Trash2 className="size-2.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        <input
          value={newLessonTitle}
          onChange={(e) => setNewLessonTitle(e.target.value)}
          placeholder="Título da aula"
          className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11px] text-white"
        />
        <input
          value={newLessonUrl}
          onChange={(e) => setNewLessonUrl(e.target.value)}
          placeholder="URL do vídeo"
          className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[11px] text-white"
        />
        <button
          type="button"
          onClick={addLesson}
          className="rounded bg-cyan-400 px-2 py-1 text-[11px] font-semibold text-black hover:bg-cyan-300"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

/* ============ PRODUTOS TAB ============ */
function ProdutosTab({
  areaId,
  linked,
  all,
}: {
  areaId: string;
  linked: Array<{ id: string; name: string; slug: string }>;
  all: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const linkedIds = new Set(linked.map((p) => p.id));
  const unlinked = all.filter((p) => !linkedIds.has(p.id));

  function link(productId: string) {
    startTransition(async () => {
      await linkProductToMemberArea(areaId, productId);
      router.refresh();
    });
  }
  function unlink(productId: string) {
    startTransition(async () => {
      await unlinkProductFromMemberArea(areaId, productId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <SectionTitle>Produtos vinculados</SectionTitle>
        <p className="text-[11px] text-zinc-500 mt-1 mb-3">
          Toda compra paga de um produto vinculado libera acesso automático à
          área de membros.
        </p>
        {linked.length === 0 ? (
          <p className="text-xs text-zinc-500 py-3 text-center">
            Nenhum produto vinculado ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {linked.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2"
              >
                <span className="text-sm text-white">{p.name}</span>
                <button
                  type="button"
                  onClick={() => unlink(p.id)}
                  className="text-[11px] text-red-300 hover:text-red-200"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {unlinked.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <SectionTitle>Adicionar produto</SectionTitle>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unlinked.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => link(p.id)}
                className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-left text-sm text-zinc-200 hover:bg-cyan-400/[0.08] hover:text-cyan-300 transition"
              >
                <span className="truncate">{p.name}</span>
                <Plus className="size-3.5 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ HELPERS ============ */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
      {children}
    </p>
  );
}
function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {help && <p className="text-[11px] text-zinc-500 mt-0.5">{help}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition ${
          checked ? "bg-cyan-400" : "bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}
function TextRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      />
    </div>
  );
}
function UrlRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (s: string | null) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-2">{label}</label>
      <input
        type="url"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="https://..."
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      />
    </div>
  );
}
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 rounded-md cursor-pointer bg-transparent border border-white/[0.08]"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
        />
      </div>
    </div>
  );
}
