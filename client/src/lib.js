import { useSyncExternalStore } from "react";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
export const useDark = () => useSyncExternalStore((cb) => {
  darkQuery.addEventListener("change", cb);
  return () => darkQuery.removeEventListener("change", cb);
}, () => darkQuery.matches);

export const SOURCES = {
  "Google News": "var(--s-news)", "Reddit": "var(--s-reddit)", "Hacker News": "var(--s-hn)",
  "GitHub": "var(--s-github)", "Bluesky": "var(--s-bluesky)", "Mastodon": "var(--s-mastodon)", "DEV": "var(--s-dev)",
};
export const KEY_NAMES = { news: "Google News", reddit: "Reddit", hackernews: "Hacker News", github: "GitHub",
  bluesky: "Bluesky", mastodon: "Mastodon", devto: "DEV" };
export const PER_SOURCE = 5; // posts shown per site before "Show more"
export const PER_SOURCE_MAX = 20;
export const TOP_CHART = 10;
export const PRESETS = ["software", "AI", "gaming", "cybersecurity", "crypto", "music", "movies", "football", "science", "startups", "AI vs crypto"];
export const REFRESH_MS = 10 * 60 * 1000 + 15000; // just past the server's 10-minute cache
export const ALERT_TOP = 10;
export const COUNTRIES = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
  ["IN", "India"], ["IE", "Ireland"], ["NZ", "New Zealand"], ["ZA", "South Africa"]];

export function ago(t) {
  const m = Math.round((Date.now() - new Date(t)) / 60000);
  if (!isFinite(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);

export async function fetchTrends(q, geo) {
  const res = await fetch(`/api/trends?q=${encodeURIComponent(q)}&geo=${geo}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d;
}

export const splitCompare = (q) => q.split(/\s+vs\.?\s+/i).map((s) => s.trim()).filter(Boolean);

export const topTerms = (d) =>
  new Set([...d.terms.phrases.slice(0, ALERT_TOP), ...d.terms.words.slice(0, ALERT_TOP)].map((t) => t.term));

export const allTerms = (d) => [...d.terms.phrases, ...d.terms.words];

// Phrases and words share one score scale, so one ranked list can mix them
export const topOverall = (d, n) => allTerms(d).sort((a, b) => b.score - a.score).slice(0, n);

// Terms that are new since the last check or climbed 3+ places
export const movers = (d) => [...d.terms.phrases.slice(0, 12), ...d.terms.words.slice(0, 25)]
  .filter((t) => t.prevRank === null || t.prevRank - t.rank >= 3)
  .sort((a, b) => (b.prevRank === null) - (a.prevRank === null) || (b.prevRank - b.rank) - (a.prevRank - a.rank));

export const moveLabel = (t) => t.prevRank === undefined ? "" : t.prevRank === null ? "NEW"
  : t.prevRank > t.rank ? `▲${t.prevRank - t.rank}` : t.prevRank < t.rank ? `▼${t.rank - t.prevRank}` : "";

export const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
