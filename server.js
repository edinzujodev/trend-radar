// Trend Radar: a zero-dependency Node server that gathers trending items for a topic
// from free public sources and extracts the trending words/phrases among them.
// Run: npm run dev (live reload) or npm run build && npm start, then open http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");

// Load KEY=value lines from .env (if present) without overriding real env vars
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {}

const PORT = process.env.PORT || 3000;
const CACHE_MS = 10 * 60 * 1000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
// Wikimedia and Reddit reject browser-looking agents; they ask for an honest, descriptive one
const BOT_UA = "TrendRadar/1.0 (https://localhost; personal trend dashboard)";
const cache = new Map();

// ---------- helpers ----------

async function get(url, type = "json", retry = true) {
  const bot = /wikipedia.org|wikimedia.org|reddit.com/.test(url);
  const res = await fetch(url, {
    headers: { "User-Agent": bot ? BOT_UA : UA, Accept: type === "json" ? "application/json" : "*/*" },
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 2500));
    return get(url, type, false);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return type === "json" ? res.json() : res.text();
}

function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&hellip;/g, "…")
    .replace(/&[lr]squo;/g, "'").replace(/&[lr]dquo;/g, '"').replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// Decodes twice after stripping tags: some Mastodon servers double-escape entities
function stripHtml(s = "") {
  // Inline tags vanish without a space so Mastodon's <a>#<span>tag</span></a> stays "#tag"
  return decode(decode(s).replace(/<\/?(a|span)\b[^>]*>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Hashtag-only sites: "machine learning" is searched as #machinelearning, plus each word's
// tag for phrases nobody hashtags; posts found via a single word must contain every word
const tagOf = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function topicWords(q) {
  return q.toLowerCase().split(/\s+/).map(tagOf).filter(Boolean);
}
function mentionsAll(text, words) {
  const t = text.toLowerCase();
  return words.every((w) => t.includes(w));
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : "";
}

function blocks(xml, name) {
  return xml.match(new RegExp(`<${name}[\\s>][\\s\\S]*?</${name}>`, "g")) || [];
}

const daysAgo = (d) => new Date(Date.now() - d * 864e5);
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

// ---------- sources ----------
// Each returns [{ source, title, text, url, time, score, meta }]. An empty q means "worldwide":
// each site's own front page / trending feed instead of a search.

const sources = {
  async news(q, geo) {
    const lang = geo === "US" ? "en-US" : `en-${geo}`;
    const xml = await get(
      q ? `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}&hl=${lang}&gl=${geo}&ceid=${geo}:en`
        : `https://news.google.com/rss?hl=${lang}&gl=${geo}&ceid=${geo}:en`,
      "text"
    );
    return blocks(xml, "item").slice(0, 60).map((it) => {
      const title = tag(it, "title");
      const src = tag(it, "source");
      return {
        source: "Google News",
        title: src && title.endsWith(" - " + src) ? title.slice(0, -(src.length + 3)) : title,
        url: tag(it, "link"),
        time: new Date(tag(it, "pubDate")).toISOString(),
        score: 0,
        meta: src,
        author: src,
      };
    });
  },

  async reddit(q) {
    const xml = await get(q ? `https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=top&t=day&limit=50`
      : "https://www.reddit.com/r/popular/top.rss?t=day&limit=50", "text");
    // Search also returns matching subreddits and users; only links to /comments/ are posts
    return blocks(xml, "entry").filter((e) => /<link href="[^"]*\/comments\//.test(e)).map((e) => {
      const link = (e.match(/<link href="([^"]+)"/) || [])[1] || "";
      const sub = (e.match(/<category term="([^"]+)"/) || [])[1] || "";
      const user = tag(e, "name");
      return {
        source: "Reddit",
        title: tag(e, "title"),
        url: decode(link),
        time: new Date(tag(e, "updated") || tag(e, "published")).toISOString(),
        score: 0,
        meta: [sub && "r/" + sub, user].filter(Boolean).join(" · "),
        author: user,
      };
    });
  },

  async hackernews(q) {
    const since = Math.floor(daysAgo(2).getTime() / 1000);
    const data = await get(
      q ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=60`
        : "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60"
    );
    return data.hits.map((h) => ({
      source: "Hacker News",
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      time: h.created_at,
      score: (h.points || 0) + (h.num_comments || 0),
      meta: `${h.points || 0} pts · ${h.num_comments || 0} comments`,
      author: h.author,
    }));
  },

  async github(q) {
    const since = daysAgo(7).toISOString().slice(0, 10);
    const data = await get(
      `https://api.github.com/search/repositories?q=${q ? encodeURIComponent(q) + "+" : ""}created:>${since}&sort=stars&order=desc&per_page=30`
    );
    // New repos impersonating paid apps ("X for Windows, download") or game cheats/spoofers are
    // malware bait with bought stars
    const bait = /\b(download|unlock|activat\w*|for (windows|pc|mac)|windows 1[01]|installer|spoofer|hwid|cheats?|aimbot|injector|executor)\b/i;
    const real = data.items.filter((r) => r.language && !bait.test(`${r.description} ${(r.topics || []).join(" ")}`));
    return real.map((r) => ({
      source: "GitHub",
      title: r.full_name,
      text: r.description || "",
      tags: r.topics || [],
      url: r.html_url,
      time: r.created_at,
      score: r.stargazers_count,
      meta: `★ ${r.stargazers_count}${r.language ? " · " + r.language : ""}`,
      author: r.owner && r.owner.login,
    }));
  },

  async bluesky(q) {
    const since = daysAgo(2).toISOString();
    // Worldwide: Bluesky's own "What's Hot" feed, English posts only
    const posts = q ? null : (await get("https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed?feed=at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot&limit=60"))
      .feed.map((f) => f.post).filter((p) => !p.record?.langs || p.record.langs.some((l) => l.startsWith("en")));
    const data = posts ? { posts } : await get(
      // English only: every country in the picker is English-speaking, and short topics like
      // "AI" otherwise match common words in other languages (Portuguese "aí")
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=top&limit=60&since=${since}&lang=en`
    );
    return data.posts.map((p) => {
      const text = decode((p.record && p.record.text) || ""); // some cross-posting bots leave HTML entities in
      return {
        source: "Bluesky",
        title: text.length > 160 ? text.slice(0, 157) + "…" : text,
        text,
        url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split("/").pop()}`,
        time: p.indexedAt,
        score: (p.likeCount || 0) + 2 * (p.repostCount || 0),
        meta: `♥ ${p.likeCount || 0} · ⟳ ${p.repostCount || 0} · @${p.author.handle}`,
        author: p.author.handle,
      };
    });
  },

  async mastodon(q) {
    const words = topicWords(q), hashtag = words.join("");
    const any = words.length > 1 ? words.map((w) => `&any[]=${w}`).join("") : "";
    const data = await get(q ? `https://mastodon.social/api/v1/timelines/tag/${hashtag}?limit=40${any}`
      : "https://mastodon.social/api/v1/trends/statuses?limit=40");
    return data.filter((s) => !s.language || s.language.startsWith("en")).flatMap((s) => {
      const text = stripHtml(s.content);
      if (words.length > 1 && !s.tags.some((t) => t.name.toLowerCase() === hashtag) && !mentionsAll(text, words)) return [];
      return {
        source: "Mastodon",
        title: text.length > 160 ? text.slice(0, 157) + "…" : text,
        text,
        url: s.url,
        time: s.created_at,
        score: (s.favourites_count || 0) + 2 * (s.reblogs_count || 0),
        meta: `♥ ${s.favourites_count || 0} · ⟳ ${s.reblogs_count || 0} · @${s.account.acct}`,
        author: s.account.acct,
      };
    });
  },

  async devto(q) {
    const words = topicWords(q), joined = words.join("");
    const tags = words.length > 1 ? [joined, ...words] : [joined];
    const lists = q ? await Promise.all(tags.map((t, i) =>
      get(`https://dev.to/api/articles?tag=${t}&top=3&per_page=30`).catch((e) => { if (i === 0) throw e; return []; })))
      : [await get("https://dev.to/api/articles?top=1&per_page=30")];
    const seen = new Set();
    const data = lists.flatMap((list, i) => list.filter((a) =>
      !seen.has(a.id) && seen.add(a.id) &&
      (i === 0 || mentionsAll(`${a.title} ${a.description} ${(a.tag_list || []).join(" ")}`, words))));
    return data.map((a) => ({
      source: "DEV",
      title: a.title,
      text: a.description || "",
      tags: a.tag_list || [],
      url: a.url,
      time: a.published_at,
      score: a.positive_reactions_count + a.comments_count,
      meta: `♥ ${a.positive_reactions_count} · ${a.comments_count} comments`,
      author: a.user && a.user.username,
    }));
  },
};

// Google's daily search trends (not topic-searchable, so we filter by the topic words)
async function googleTrends(q, geo) {
  const xml = await get(`https://trends.google.com/trending/rss?geo=${geo}`, "text");
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = blocks(xml, "item").map((it) => ({
    term: tag(it, "title"),
    traffic: tag(it, "ht:approx_traffic"),
    news: blocks(it, "ht:news_item").map((n) => ({
      title: tag(n, "ht:news_item_title"),
      url: tag(n, "ht:news_item_url"),
      source: tag(n, "ht:news_item_source"),
    })),
  }));
  // Worldwide, every top search counts as a match
  const matches = !terms.length ? all : all.filter((t) => {
    const hay = (t.term + " " + t.news.map((n) => n.title).join(" ")).toLowerCase();
    return terms.some((w) => hay.includes(w));
  });
  return { matches, top: all };
}

// Wikipedia: find articles about the topic and flag the ones with a recent spike in views
// For a topic: related articles, rising first. Worldwide: yesterday's most-read articles.
async function wikipediaSpikes(q) {
  let titles;
  if (q) {
    const search = await get(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=15&format=json&origin=*`
    );
    titles = search.query.search.map((s) => s.title);
  } else {
    const d = daysAgo(1);
    const top = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`);
    titles = top.items[0].articles.map((a) => a.article.replace(/_/g, " "))
      .filter((t) => t !== "Main Page" && !/^(Special|Wikipedia|Portal|File|Help|Category|Talk|User):/.test(t))
      .slice(0, 15);
  }
  const end = ymd(daysAgo(1));
  const start = ymd(daysAgo(15));
  const rows = await Promise.all(
    titles.map(async (title) => {
      try {
        const art = encodeURIComponent(title.replace(/ /g, "_"));
        const d = await get(
          `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${art}/daily/${start}/${end}`
        );
        const v = d.items.map((i) => i.views);
        if (v.length < 5) return null;
        const recent = (v[v.length - 1] + v[v.length - 2]) / 2;
        const base = v.slice(0, -2).reduce((a, b) => a + b, 0) / (v.length - 2) || 1;
        return {
          title,
          url: `https://en.wikipedia.org/wiki/${art}`,
          views: v[v.length - 1],
          change: recent / base,
          series: v,
        };
      } catch {
        return null;
      }
    })
  );
  return rows.filter(Boolean).sort((a, b) => (q ? b.change - a.change : b.views - a.views));
}

// What the platforms themselves list as trending (worldwide view only)
async function platformTrends() {
  const [bsky, masto] = await Promise.allSettled([
    get("https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=15"),
    get("https://mastodon.social/api/v1/trends/tags?limit=15"),
  ]);
  return {
    bluesky: bsky.status === "fulfilled"
      ? bsky.value.topics.map((t) => ({ name: t.displayName || t.topic, description: t.description || "", url: `https://bsky.app${t.link}` }))
      : [],
    mastodon: masto.status === "fulfilled"
      ? masto.value.map((t) => ({ name: "#" + t.name, uses: (t.history || []).slice(0, 2).reduce((n, h) => n + +h.uses, 0), url: t.url }))
      : [],
  };
}

// ---------- spam filtering ----------

const SPAM = /\b(crack(ed)?|keygen|serial key|license key|activation (key|code)|direct download|free download|full version|torrent|nulled|pre-?activated|portable download)\b/i;

// Drop obvious warez spam and collapse copy-paste posts (bot networks post the same template)
function cleanItems(items) {
  const seen = new Set();
  return items.filter((it) => {
    const body = `${it.title} ${it.text || ""}`;
    if (SPAM.test(body)) return false;
    const norm = (x) => x.toLowerCase().replace(/https?:\/\/\S+|[^a-z]+/g, "").slice(0, 80);
    const sigs = [it.source + "|" + norm(body)];
    // Bot networks also reuse one long description under different titles (repo names)
    if ((it.text || "").length >= 60) sigs.push(it.source + "|text|" + norm(it.text));
    if (sigs.some((x) => seen.has(x))) return false;
    sigs.forEach((x) => seen.add(x));
    return true;
  });
}

// ---------- trending word extraction ----------

const STOP = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both but by
  can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further get gets got had hadn't has
  hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is
  isn't it it's its itself just let's like me more most mustn't my myself new no nor not now of off on once only or other ought our ours
  ourselves out over own same say says said she she'd she'll she's should shouldn't so some such than that that's the their theirs them
  themselves then there there's these they they'd they'll they're they've this those through to too under until up very via was wasn't we
  we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will with won't would
  wouldn't you you'd you'll you're you've your yours yourself yourselves one two three first last next back way make makes made use using
  used want need know think see look going go got really much many even still well every year years day days today time week weeks
  people thing things lot something anyone everyone someone via amp http https www com org net html ago yet may might must shall
  per around across across within without way best top good great big better around being getting take takes says according
  report reports news update updates read here's video watch live today's week's yesterday tomorrow www.reddit.com reddit comments
  points post posts thread link submitted check help question anyone just don't i'm it's that's you're can't doesn't isn't`.split(/\s+/)
);

function tokens(text) {
  return (text.toLowerCase().replace(/https?:\/\/\S+/g, " ").match(/[a-z0-9][a-z0-9+#.'-]*[a-z0-9+#]|[a-z0-9]/g) || [])
    .map((w) => w.replace(/'s$/, ""))
    .filter((w) => w.length > 1);
}

function trendingTerms(items, query) {
  const qWords = new Set(tokens(query));
  const isWord = (w) => w.length > 2 && !STOP.has(w) && !qWords.has(w) && !/^\d+$/.test(w);

  // Normalise engagement within each source so one platform can't dominate
  const maxBySource = {};
  for (const it of items) maxBySource[it.source] = Math.max(maxBySource[it.source] || 0, it.score || 0);

  const terms = new Map();
  for (const it of items) {
    const max = maxBySource[it.source];
    const weight = 1 + (max > 0 ? Math.log1p(it.score || 0) / Math.log1p(max) : 0);
    const toks = tokens(`${it.title} ${it.text || ""}`);
    const seen = new Set();
    for (let i = 0; i < toks.length; i++) {
      const a = toks[i], b = toks[i + 1];
      if (isWord(a)) seen.add(a);
      if (b && isWord(a) && isWord(b)) seen.add(a + " " + b);
    }
    // Tags count as words but never form phrases: neighbouring tags in a list aren't a phrase
    for (const tag of it.tags || []) for (const w of tokens(tag)) if (isWord(w)) seen.add(w);
    for (const t of seen) {
      if (!terms.has(t)) terms.set(t, { term: t, count: 0, weight: 0, sources: new Set(), authors: new Map(), items: [] });
      const e = terms.get(t);
      e.items.push(it.id);
      e.sources.add(it.source);
      // Each account counts once per term, so one spammy poster can't fake a trend
      const who = `${it.source}|${it.author || it.id}`;
      const prev = e.authors.get(who);
      if (prev === undefined) {
        e.count++;
        e.weight += weight;
        e.authors.set(who, weight);
      } else if (weight > prev) {
        e.weight += weight - prev;
        e.authors.set(who, weight);
      }
    }
  }

  const ranked = [...terms.values()]
    .filter((e) => e.count >= 2)
    .map((e) => ({
      term: e.term,
      count: e.count,
      sources: [...e.sources],
      items: e.items,
      // Appearing on several platforms is the strongest trend signal
      score: +(
        e.weight *
        (e.sources.size === 1 ? 0.6 : 1 + 0.6 * (e.sources.size - 1)) *
        (e.term.includes(" ") ? 1.4 : 1)
      ).toFixed(2),
    }))
    .sort((a, b) => b.score - a.score);

  // Two people on one site is often a bot pair or coincidence; ask for a second site or a third
  // person. Niche topics may not have enough of those, so fall back to the looser list.
  const solid = (t) => t.sources.length >= 2 || t.count >= 3;
  const pick = (list, n) => {
    const strict = list.filter(solid);
    return (strict.length >= Math.min(8, n) ? strict : list).slice(0, n);
  };

  // Drop single words that are mostly just part of a higher-ranked phrase ("open" next to "open source")
  const phrases = pick(ranked.filter((t) => t.term.includes(" ")), 25);
  const words = pick(ranked
    .filter((t) => !t.term.includes(" "))
    .filter((w) => !phrases.some((p) => p.term.split(" ").includes(w.term) && p.count >= w.count * 0.6)), 40);
  return { phrases, words };
}

// ---------- per-post trending score ----------

// Only compared within one source. Sites with engagement counts use velocity
// (HN-style gravity, so a fresh post gaining fast beats an old one with more total).
// Reddit's feed is already "top today" so its order is kept; Google News has no
// signal at all, so stories score by how many of the trending terms they carry.
function withTrend(items, terms) {
  const termWeight = new Map();
  for (const t of [...terms.phrases, ...terms.words])
    for (const id of t.items) termWeight.set(id, (termWeight.get(id) || 0) + t.score);

  const now = Date.now();
  return items.map((it, pos) => {
    let trend;
    if (it.source === "Reddit") trend = -pos;
    else if (it.source === "Google News") trend = termWeight.get(it.id) || 0;
    else {
      const hours = Math.max(0, (now - new Date(it.time)) / 36e5);
      trend = (it.score || 0) / Math.pow(hours + 2, 1.5);
    }
    return { ...it, trend: +trend.toFixed(4) };
  });
}

// ---------- history (rising / falling) ----------

// Each fresh fetch saves the ranked terms with their scores, so later fetches can say what moved
// and draw each term over time. Comparing with a snapshot at least an hour old keeps 10-minute
// refreshes from showing only noise; snapshots closer than 30 minutes replace each other, so
// ~400 of them cover about two weeks of regular checking.
const HISTORY_FILE = process.env.HISTORY_FILE || path.join(__dirname, "data", "history.json"); // override for a host's persistent disk
const HISTORY_KEEP = 400;
const COMPARE_AFTER_MS = 60 * 60 * 1000;
const MERGE_WITHIN_MS = 30 * 60 * 1000;
const WEEK_MS = 7 * 864e5;
const TIMELINE_TERMS = 8;
const TIMELINE_POINTS = 60;
let historyDb = {};
try { historyDb = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch {}

// Older snapshots stored bare term lists; newer ones store [term, score] pairs
const entries = (snap, kind) => (snap[kind] || []).map((e) => (Array.isArray(e) ? e : [e, null]));
const namesOf = (snap, kind) => entries(snap, kind).map((e) => e[0]);
const scoreIn = (snap, term) => {
  for (const kind of ["phrases", "words"]) for (const [t, s] of entries(snap, kind)) if (t === term) return s;
  return 0; // below the saved top lists
};

function withHistory(key, terms) {
  const snaps = historyDb[key] || [];
  const now = Date.now();
  const prev = [...snaps].reverse().find((s) => now - s.at >= COMPARE_AFTER_MS) || snaps[snaps.length - 1];

  const out = { comparedAt: prev ? new Date(prev.at).toISOString() : null, dropped: {} };
  for (const kind of ["phrases", "words"]) {
    const before = prev ? namesOf(prev, kind) : null;
    terms[kind].forEach((t, i) => {
      t.rank = i + 1;
      if (before) t.prevRank = before.indexOf(t.term) + 1 || null; // null = new since then
    });
    const nowSet = new Set(terms[kind].map((t) => t.term));
    out.dropped[kind] = before ? before.filter((t) => !nowSet.has(t)).slice(0, 10) : [];
  }

  const snap = { at: now, phrases: terms.phrases.map((t) => [t.term, t.score]), words: terms.words.map((t) => [t.term, t.score]) };
  if (snaps.length && now - snaps[snaps.length - 1].at < MERGE_WITHIN_MS) snaps[snaps.length - 1] = snap;
  else snaps.push(snap);
  historyDb[key] = snaps.slice(-HISTORY_KEEP);

  // Last 7 days, thinned to at most TIMELINE_POINTS, for the top phrases and words now
  // Older snapshots without scores can't be drawn, so they're left out
  const week = historyDb[key].filter((s) => now - s.at <= WEEK_MS && entries(s, "words")[0]?.[1] != null);
  const step = Math.max(1, Math.ceil(week.length / TIMELINE_POINTS));
  const points = week.filter((_, i) => i % step === 0 || i === week.length - 1);
  const top = [...terms.phrases.slice(0, TIMELINE_TERMS / 2), ...terms.words.slice(0, TIMELINE_TERMS / 2)].map((t) => t.term);
  out.timeline = { at: points.map((s) => new Date(s.at).toISOString()), series: top.map((term) => ({ term, scores: points.map((s) => scoreIn(s, term)) })) };

  // Rising this week: now vs the oldest snapshot in the last 7 days, if it's at least 6 hours old
  const base = week.find((s) => now - s.at >= 6 * 36e5);
  out.weekly = base ? {
    since: new Date(base.at).toISOString(),
    rising: [...terms.phrases.slice(0, 25), ...terms.words.slice(0, 40)]
      .map((t) => ({ term: t.term, now: t.score, then: scoreIn(base, t.term) }))
      .filter((r) => r.now > r.then)
      .sort((a, b) => (b.now - b.then) - (a.now - a.then))
      .slice(0, 10),
  } : null;
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyDb));
  } catch (e) {
    console.warn("Could not save history:", e.message);
  }
  return out;
}

// ---------- API ----------

async function trends(q, geo) {
  const key = `${q.toLowerCase()}|${geo}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const names = Object.keys(sources);
  const results = await Promise.allSettled(names.map((n) => sources[n](q, geo)));
  const status = {};
  let items = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      status[names[i]] = { ok: true, count: r.value.length };
      items.push(...r.value);
    } else {
      status[names[i]] = { ok: false, error: String(r.reason && r.reason.message) };
    }
  });
  items = cleanItems(items.filter((it) => it.title)).map((it, id) => ({ ...it, id }));

  const terms = trendingTerms(items, q);
  items = withTrend(items, terms);
  const changes = withHistory(key, terms);

  const [gt, wiki, plat] = await Promise.allSettled([googleTrends(q, geo), wikipediaSpikes(q), q ? null : platformTrends()]);
  const data = {
    query: q,
    geo,
    fetchedAt: new Date().toISOString(),
    status,
    terms,
    changes,
    googleTrends: gt.status === "fulfilled" ? gt.value : { matches: [], top: [], error: String(gt.reason) },
    wikipedia: wiki.status === "fulfilled" ? wiki.value : [],
    platforms: plat.status === "fulfilled" ? plat.value : null,
    items,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

const server = http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/trends") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
      const geo = (url.searchParams.get("geo") || "US").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "US";
      try {
        const data = await trends(q, geo);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    if (vite) return vite.middlewares(req, res, () => { res.writeHead(404); res.end("Not found"); });
    serveStatic(url.pathname, res);
  });

// ---------- client ----------

const DIST = path.join(__dirname, "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };

// Serves the Vite build; any unknown path gets index.html so ?q= links work from anywhere
function serveStatic(pathname, res) {
  let file;
  try { file = path.normalize(path.join(DIST, decodeURIComponent(pathname))); } catch { file = DIST; } // malformed %-escape
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  if (!fs.existsSync(file)) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    return res.end("Client not built yet. Run `npm run build`, or use `npm run dev`.");
  }
  const hashed = /[\\/]assets[\\/]/.test(file); // Vite fingerprints these, so they can be cached forever
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache" });
  fs.createReadStream(file).pipe(res);
}

let vite = null;
(async () => {
  if (process.argv.includes("--dev")) {
    const { createServer } = await import("vite");
    vite = await createServer({
      configFile: path.join(__dirname, "vite.config.mjs"),
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
  }
  server.listen(PORT, () => console.log(`Trend Radar running at http://localhost:${PORT}${vite ? " (dev, live reload)" : ""}`));
})();
