// Проверка контента перед публикацией: ловит опечатки в темпланах и конспектах,
// чтобы сайт не сломался. Запускается автоматически в npm run build.
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import matter from "gray-matter";

const ROOT = path.join(process.cwd(), "content");
const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`✗ ${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`! ${file}: ${msg}`);
const rel = (f) => path.relative(process.cwd(), f);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function readYaml(file) {
  try {
    return yaml.load(fs.readFileSync(file, "utf8")) ?? {};
  } catch (e) {
    err(rel(file), `не читается YAML (${e.reason ?? e.message}, строка ${(e.mark?.line ?? 0) + 1})`);
    return null;
  }
}

// site.yaml
const site = readYaml(path.join(ROOT, "site.yaml"));
if (site) for (const k of ["title", "author"]) if (!site[k]) err("content/site.yaml", `нет поля ${k}`);

// Предметы
const subjectsDir = path.join(ROOT, "subjects");
const subjects = new Set();
for (const slug of fs.readdirSync(subjectsDir)) {
  const dir = path.join(subjectsDir, slug);
  if (!fs.statSync(dir).isDirectory()) continue;
  const file = path.join(dir, "subject.yaml");
  const f = rel(file);
  if (!SLUG.test(slug)) err(rel(dir), "имя папки — только латиница, цифры и дефис (например, normal-anatomy)");
  if (!fs.existsSync(file)) { err(rel(dir), "нет файла subject.yaml"); continue; }
  const s = readYaml(file);
  if (!s) continue;
  subjects.add(slug);
  if (!s.name) err(f, "нет поля name");
  if (s.color && !/^#[0-9a-fA-F]{6}$/.test(s.color)) err(f, `color должен быть вида #5b3df5, сейчас «${s.color}»`);

  const notesDir = path.join(dir, "notes");
  const notes = fs.existsSync(notesDir)
    ? fs.readdirSync(notesDir).filter((x) => x.endsWith(".md")).map((x) => x.slice(0, -3))
    : [];
  const linked = new Set();
  const nums = new Set();
  (s.plan ?? []).forEach((p, i) => {
    const where = `${f}, тема ${p?.n ?? `#${i + 1}`}`;
    if (typeof p?.n !== "number") err(where, "у темы нет номера n");
    else if (nums.has(p.n)) err(where, `номер ${p.n} повторяется`);
    else nums.add(p.n);
    if (!p?.topic) err(where, "нет названия темы (topic)");
    if (p?.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date instanceof Date ? p.date.toISOString().slice(0, 10) : String(p.date)))
      err(where, `дата должна быть вида "2026-09-15", сейчас «${p.date}»`);
    if (p?.note) {
      if (!notes.includes(p.note)) err(where, `нет файла конспекта notes/${p.note}.md`);
      linked.add(p.note);
    }
  });
  for (const b of s.books ?? []) {
    if (!b?.title) err(f, "у книги нет title");
    if (b?.kind && !["основная", "дополнительная"].includes(b.kind))
      err(f, `kind книги «${b.title}» должен быть «основная» или «дополнительная»`);
  }

  // Конспекты
  for (const n of notes) {
    const nf = rel(path.join(notesDir, `${n}.md`));
    if (!SLUG.test(n)) err(nf, "имя файла — только латиница, цифры и дефис");
    if (!linked.has(n)) warn(nf, "конспект не привязан к теме в темплане (поле note), в темплане ссылки не будет");
    let data;
    try {
      data = matter(fs.readFileSync(path.join(notesDir, `${n}.md`), "utf8")).data;
    } catch (e) {
      err(nf, `не читается шапка конспекта (${e.reason ?? e.message})`);
      continue;
    }
    if (!data.title) err(nf, "нет title");
    if (data.status && !["черновик", "проверено"].includes(data.status))
      err(nf, `status должен быть «черновик» или «проверено», сейчас «${data.status}»`);
    if (data.summary && !Array.isArray(data.summary)) err(nf, "summary должен быть списком");
    (data.questions ?? []).forEach((q, i) => {
      if (!q?.q || !q?.a) err(nf, `в вопросе ${i + 1} нужны и q, и a`);
    });
    (data.terms ?? []).forEach((t, i) => {
      if (!t?.term || !t?.def) err(nf, `в термине ${i + 1} нужны и term, и def`);
    });
  }
}

// Расписание
const sch = readYaml(path.join(ROOT, "schedule.yaml"));
for (const d of sch?.days ?? []) {
  for (const it of d.items ?? []) {
    if (it.subject && !subjects.has(it.subject))
      err("content/schedule.yaml", `${d.day}: нет предмета с папкой «${it.subject}»`);
    if (!it.time) err("content/schedule.yaml", `${d.day}: у занятия нет времени (time)`);
  }
}

for (const w of warnings) console.log(w);
if (errors.length) {
  console.error(`\nОшибки в контенте (${errors.length}). Сайт не опубликуется, пока их не исправить:\n`);
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`Контент в порядке: предметов ${subjects.size}.`);
