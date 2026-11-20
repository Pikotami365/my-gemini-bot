"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Включает анимации при прокрутке: элементы с data-reveal и выделения <mark>
 * получают класс is-in, когда появляются на экране. Без JS всё видно сразу.
 */
export default function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const html = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      html.classList.remove("motion-ready");
      return;
    }
    html.classList.add("motion-ready");
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal], .prose mark");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.15 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
