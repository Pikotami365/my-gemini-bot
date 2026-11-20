import { getSite } from "@/lib/content";
import { OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Превью сайта";

export default async function Image() {
  const site = getSite();
  return ogImage({ site: site.title, title: "Медицина по полочкам" });
}
