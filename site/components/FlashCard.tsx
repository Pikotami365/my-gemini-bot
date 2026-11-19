"use client";

import Link from "next/link";
import { useState } from "react";

/** Карточка «Вопрос дня»: нажми, чтобы перевернуть. */
export default function FlashCard({
  question,
  answerHtml,
  subjectName,
  color,
  href,
  noteTitle,
}: {
  question: string;
  answerHtml: string | null;
  subjectName: string;
  color: string;
  href: string;
  noteTitle: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const loginHref = `/register?next=${encodeURIComponent("/")}`;

  return (
    <div className="flash" style={{ ["--subj" as string]: color }}>
      <div className="flash-stack" aria-hidden />
      <div className={`flash-inner${flipped ? " is-flipped" : ""}`}>
        <section className="flash-face flash-front" aria-hidden={flipped}>
          <div className="flash-top">
            <span className="flash-kicker">Вопрос дня</span>
            <span className="chip" style={{ background: color }}>
              {subjectName}
            </span>
          </div>
          <p className="flash-q">{question}</p>
          <button className="btn btn-light" onClick={() => setFlipped(true)} tabIndex={flipped ? -1 : 0}>
            Показать ответ
          </button>
        </section>
        <section className="flash-face flash-back" aria-hidden={!flipped}>
          <div className="flash-top">
            <span className="flash-kicker">Ответ</span>
            <button
              className="flash-again"
              onClick={() => setFlipped(false)}
              tabIndex={flipped ? 0 : -1}
            >
              К вопросу
            </button>
          </div>
          {answerHtml ? (
            <>
              <div className="flash-a" dangerouslySetInnerHTML={{ __html: answerHtml }} />
              <Link href={href} className="flash-link" tabIndex={flipped ? 0 : -1}>
                Повторить тему «{noteTitle}»
              </Link>
            </>
          ) : (
            <>
              <p className="flash-a">
                Ответ видят участники. Регистрация бесплатная и займёт минуту.
              </p>
              <Link href={loginHref} className="btn btn-primary" tabIndex={flipped ? 0 : -1}>
                Создать аккаунт
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
