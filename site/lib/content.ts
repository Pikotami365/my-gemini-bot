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
    demo: raw.demo ?? false,
    plan: (raw.plan ?? []).map((p) => ({ ...p, date: str(p.date) || undefined })),
    books: raw.books ?? [],
  };
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
