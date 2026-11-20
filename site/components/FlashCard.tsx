"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type Card = {
  q: string;
  answerHtml: string | null;
  subjectName: string;
  color: string;
  href: string;
  noteTitle: string;
};

const STREAK_KEY = "daily-streak";

function bishkekDay(d = new Date()) {
  return new Date(d.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Серия дней подряд, когда человек открывал ответ. Хранится только в этом браузере. */
function bumpStreak(): number {
  try {
    const today = bishkekDay();
    const yesterday = bishkekDay(new Date(Date.now() - 86_400_000));
    const raw = JSON.parse(localStorage.getItem(STREAK_KEY) ?? "null") as
      | { last: string; streak: number }
      | null;
    let streak = 1;
    if (raw?.last === today) streak = raw.streak;
    else if (raw?.last === yesterday) streak = raw.streak + 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, streak }));
    return streak;
  } catch {
    return 0;
  }
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
  return "дней";
}

/** Колода карточек: вопрос дня первым. Нажми, чтобы перевернуть, свайпни влево — следующий. */
export default function FlashCard({ cards, locked }: { cards: Card[]; locked: boolean }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const [streak, setStreak] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const card = cards[i];
  const canNext = !locked && cards.length > 1;

  const reduced = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && !locked) setStreak(bumpStreak());
      return !f;
    });
  }, [locked]);

  const next = useCallback(() => {
    if (!canNext || phase !== "idle") return;
    const go = () => {
      setI((v) => (v + 1) % cards.length);
      setFlipped(false);
    };
    if (reduced()) return go();
    setPhase("leaving");
    window.setTimeout(() => {
      go();
      setPhase("entering");
      window.setTimeout(() => setPhase("idle"), 420);
    }, 320);
  }, [canNext, phase, cards.length]);

  // Наклон за курсором — только мышь и только без «уменьшить движение».
  useEffect(() => {
    const el = root.current;
    if (!el || reduced() || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${x * 10}deg`);
      el.style.setProperty("--rx", `${-y * 10}deg`);
    };
    const leave = () => {
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--rx", "0deg");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  if (!card) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (canNext && dx < -60 && Math.abs(dy) < 60) next();
  };

  return (
    <div
      ref={root}
      className="flash"
      style={{ ["--subj" as string]: card.color }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="flash-stack flash-stack-2" aria-hidden />
      <div className="flash-stack" aria-hidden />
      <div className={`flash-tilt flash-${phase}`}>
        <div className={`flash-inner${flipped ? " is-flipped" : ""}`}>
          <section className="flash-face flash-front" aria-hidden={flipped}>
            <div className="flash-top">
              <span className="flash-kicker">
                {i === 0 ? "Вопрос дня" : `Вопрос ${i + 1} из ${cards.length}`}
              </span>
              <span className="chip">{card.subjectName}</span>
            </div>
            <p className="flash-q" key={card.q}>
              {card.q}
            </p>
            <div className="flash-actions">
              <button className="btn btn-light" onClick={flip} tabIndex={flipped ? -1 : 0}>
                Показать ответ
              </button>
              {canNext && (
                <button className="flash-skip" onClick={next} tabIndex={flipped ? -1 : 0}>
                  Пропустить
                </button>
              )}
            </div>
          </section>

          <section className="flash-face flash-back" aria-hidden={!flipped}>
            <div className="flash-top">
              <span className="flash-kicker">Ответ</span>
              {streak > 1 ? (
                <span className="streak" title="Дней подряд с вопросом дня">
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
                    <path
                      d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 11 11c0-4 1-9 1-9z"
                      fill="currentColor"
                    />
                  </svg>
                  {streak} {plural(streak)} подряд
                </span>
              ) : (
                <button className="flash-again" onClick={flip} tabIndex={flipped ? 0 : -1}>
                  К вопросу
                </button>
              )}
            </div>
            {card.answerHtml ? (
              <>
                <div className="flash-a" dangerouslySetInnerHTML={{ __html: card.answerHtml }} />
                <div className="flash-actions">
                  {canNext && (
                    <button className="btn btn-primary" onClick={next} tabIndex={flipped ? 0 : -1}>
                      Следующий вопрос
                    </button>
                  )}
                  <Link href={card.href} className="flash-link" tabIndex={flipped ? 0 : -1}>
                    Повторить тему
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="flash-a">
                  Ответ видят участники. Регистрация бесплатная и займёт минуту, а после неё
                  откроется вся колода вопросов.
                </p>
                <Link href="/register" className="btn btn-primary" tabIndex={flipped ? 0 : -1}>
                  Создать аккаунт
                </Link>
              </>
            )}
          </section>
        </div>
      </div>
      {canNext && <p className="flash-hint">Свайп влево — следующий вопрос</p>}
    </div>
  );
}
