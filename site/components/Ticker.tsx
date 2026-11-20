/** Бегущая строка тем и терминов. Вторая копия нужна для бесшовного цикла. */
export default function Ticker({ items }: { items: { text: string; color: string }[] }) {
  if (items.length === 0) return null;
  const list = (hidden: boolean) => (
    <ul className="ticker-list" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={i}>
          <span className="ticker-dot" style={{ background: it.color }} />
          {it.text}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ticker" style={{ ["--dur" as string]: `${Math.max(24, items.length * 3.2)}s` }}>
      <div className="ticker-track">
        {list(false)}
        {list(true)}
      </div>
    </div>
  );
}
