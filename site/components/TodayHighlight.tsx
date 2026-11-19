"use client";

import { useEffect } from "react";

const DAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

/** Подсвечивает сегодняшний день недели (время Бишкека, UTC+6). */
export default function TodayHighlight() {
  useEffect(() => {
    const now = new Date(Date.now() + 6 * 3600 * 1000);
    const today = DAYS[now.getUTCDay()];
    document.querySelectorAll<HTMLElement>(".day").forEach((el) => {
      if (el.dataset.day === today) {
        el.classList.add("today");
        const h = el.querySelector("h3");
        if (h && !h.querySelector(".badge")) {
          const b = document.createElement("span");
          b.className = "badge badge-ok";
          b.textContent = "сегодня";
          h.appendChild(b);
        }
      }
    });
  }, []);
  return null;
}
