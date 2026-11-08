"use client";
import { useSearchParams } from "next/navigation";

export default function Flash() {
  const sp = useSearchParams();
  const error = sp.get("error");
  if (!error) return null;
  return <div className="alert error">{error}</div>;
}
