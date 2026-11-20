import { getNote, getSite, getSubject } from "@/lib/content";
import { OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Превью конспекта";

export default async function Image({
  params,
}: {
  params: Promise<{ subject: string; note: string }>;
}) {
  const { subject, note } = await params;
  const s = getSubject(subject);
  const n = s ? getNote(subject, note) : null;
  return ogImage({
    site: getSite().title,
    title: n?.title ?? "Конспект",
    label: s ? `Конспект, ${s.name.toLowerCase()}` : undefined,
    color: s?.color,
    mark: s?.name.slice(0, 1),
  });
}
