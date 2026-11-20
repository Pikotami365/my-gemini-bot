import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = path.join(process.cwd(), "content");

export type Site = {
  title: string;
  tagline: string;
  author: string;
  about: string;
  disclaimer: string;
  /** true — блок «Кратко» виден без регистрации */
  public_summary?: boolean;
  links?: { label: string; url: string }[];
};

export type PlanItem = {
  n: number;
  date?: string;
  topic: string;
  type?: string;
  note?: string;
};

export type Book = {
  title: string;
  authors?: string;
  kind: "основная" | "дополнительная";
  comment?: string;
};

export type Subject = {
  slug: string;
  name: string;
  order: number;
  semester?: string;
  department?: string;
  teachers?: string[];
  control?: string;
  color: string;
  demo?: boolean;
  plan: PlanItem[];
  books: Book[];
};

export type NoteMeta = {
  slug: string;
  subject: string;
  title: string;
  status: "черновик" | "проверено";
  updated: string;
  summary: string[];
};

export type Note = NoteMeta & {
  html: string;
  terms: { term: string; def: string }[];
  questions: { q: string; a: string }[];
  sources: string[];
  /** Заголовки разделов — их видят и без регистрации. */
  outline: string[];
};

export type ScheduleItem = {
  time: string;
  subject?: string;
  title?: string;
  type?: string;
  room?: string;
  weeks?: string;
};

export type Schedule = {
  updated?: string;
  demo?: boolean;
  comment?: string;
  days: { day: string; items: ScheduleItem[] }[];
};

function readYaml<T>(file: string): T {
  return yaml.load(fs.readFileSync(file, "utf8")) as T;
}

function str(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v == null ? "" : String(v);
}

export function getSite(): Site {
  return readYaml<Site>(path.join(ROOT, "site.yaml"));
}

export function getSchedule(): Schedule {
  const s = readYaml<Schedule>(path.join(ROOT, "schedule.yaml"));
  return { ...s, updated: str(s.updated), days: s.days ?? [] };
}

export function getSubjects(): Subject[] {
  const dir = path.join(ROOT, "subjects");
  return fs
    .readdirSync(dir)
    .filter((slug) => fs.existsSync(path.join(dir, slug, "subject.yaml")))
    .map((slug) => getSubject(slug)!)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ru"));
}

export function getSubject(slug: string): Subject | null {
  const file = path.join(ROOT, "subjects", slug, "subject.yaml");
  if (!fs.existsSync(file)) return null;
  const raw = readYaml<Partial<Subject>>(file);
  return {
    slug,
    name: raw.name ?? slug,
    order: raw.order ?? 100,
    semester: raw.semester,
    department: raw.department,
    teachers: raw.teachers ?? [],
    control: raw.control,
    color: raw.color ?? SUBJECT_COLORS[hash(slug) % SUBJECT_COLORS.length],
    demo: raw.demo ?? false,
    plan: (raw.plan ?? []).map((p) => ({ ...p, date: str(p.date) || undefined })),
    books: raw.books ?? [],
  };
}

const SUBJECT_COLORS = ["#5b3df5", "#ff4f7b", "#10b98a", "#2f8cff", "#ff8a1f"];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function notesDir(subject: string) {
  return path.join(ROOT, "subjects", subject, "notes");
}

export function getNoteSlugs(subject: string): string[] {
  const dir = notesDir(subject);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getNote(subject: string, slug: string): Note | null {
  const file = path.join(notesDir(subject), `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  return {
    slug,
    subject,
    title: str(data.title) || slug,
    status: data.status === "проверено" ? "проверено" : "черновик",
    updated: str(data.updated),
    summary: data.summary ?? [],
    terms: data.terms ?? [],
    questions: data.questions ?? [],
    sources: data.sources ?? [],
    outline: [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/^\d+\.\s*/, "").trim()),
    html: renderMarkdown(content),
  };
}

export function getNotes(subject: string): NoteMeta[] {
  return getNoteSlugs(subject)
    .map((slug) => getNote(subject, slug)!)
    .map(({ slug, subject, title, status, updated, summary }) => ({
      slug,
      subject,
      title,
      status,
      updated,
      summary,
    }));
}

export function getAllNotes(): (NoteMeta & { subjectName: string })[] {
  return getSubjects()
    .flatMap((s) => getNotes(s.slug).map((n) => ({ ...n, subjectName: s.name })))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

const CALLOUTS: Record<string, string> = {
  key: "Главное",
  mnemo: "Мнемоника",
  clinic: "Клиника",
  warn: "Частая ошибка",
  exam: "Спрашивают на экзамене",
  info: "Заметка",
};

/** Markdown + цитаты-врезки вида `> [!mnemo] Заголовок`. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return html
    .replace(
      /<blockquote>\s*<p>\[!(\w+)\][ \t]*([^\n<]*)\n?/g,
      (_m, type: string, title: string) => {
        const t = CALLOUTS[type] ? type : "info";
        const label = title.trim() || CALLOUTS[t];
        return `<blockquote class="callout callout-${t}"><div class="callout-title">${label}</div><p>`;
      },
    )
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export type DailyQuestion = {
  q: string;
  a: string;
  subjectName: string;
  color: string;
  href: string;
  noteTitle: string;
};

/** Вопрос дня: один и тот же для всех весь день (по времени Бишкека), меняется в полночь. */
export function getDailyQuestion(now = new Date()): DailyQuestion | null {
  const all = getSubjects().flatMap((s) =>
    getNoteSlugs(s.slug).flatMap((slug) => {
      const n = getNote(s.slug, slug)!;
      return n.questions.map((q) => ({
        q: q.q,
        a: q.a,
        subjectName: s.name,
        color: s.color,
        href: `/subjects/${s.slug}/${slug}`,
        noteTitle: n.title,
      }));
    }),
  );
  if (all.length === 0) return null;
  const day = Math.floor((now.getTime() + 6 * 3600 * 1000) / 86_400_000);
  return all[hash(String(day)) % all.length];
}

/**
 * Колода для тренировки: вопрос дня первым, остальные перемешаны (порядок свой на каждый день).
 */
export function getQuestionDeck(now = new Date(), limit = 30): DailyQuestion[] {
  const daily = getDailyQuestion(now);
  if (!daily) return [];
  const day = Math.floor((now.getTime() + 6 * 3600 * 1000) / 86_400_000);
  const rest = getSubjects()
    .flatMap((s) =>
      getNoteSlugs(s.slug).flatMap((slug) => {
        const n = getNote(s.slug, slug)!;
        return n.questions.map((q) => ({
          q: q.q,
          a: q.a,
          subjectName: s.name,
          color: s.color,
          href: `/subjects/${s.slug}/${slug}`,
          noteTitle: n.title,
        }));
      }),
    )
    .filter((x) => x.q !== daily.q)
    .map((x) => ({ x, k: hash(`${day}:${x.q}`) }))
    .sort((a, b) => a.k - b.k)
    .map(({ x }) => x);
  return [daily, ...rest].slice(0, limit);
}

/** Темы и термины для бегущей строки на главной. */
export function getTickerItems(): { text: string; color: string }[] {
  const items: { text: string; color: string }[] = [];
  for (const s of getSubjects()) {
    for (const p of s.plan) items.push({ text: p.topic, color: s.color });
    for (const slug of getNoteSlugs(s.slug)) {
      for (const t of getNote(s.slug, slug)!.terms) items.push({ text: t.term, color: s.color });
    }
  }
  return items;
}
