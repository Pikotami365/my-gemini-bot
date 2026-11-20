import { getSite, getSubject } from "@/lib/content";
import { OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Превью предмета";

export default async function Image({ params }: { params: Promise<{ subject: string }> }) {
  const s = getSubject((await params).subject);
  return ogImage({
    site: getSite().title,
    title: s ? `${s.name}: темплан, литература и конспекты` : "Предмет",
    label: s?.name,
    color: s?.color,
    mark: s?.name.slice(0, 1),
  });
}
