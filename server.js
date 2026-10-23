// Trend Radar: a zero-dependency Node server that gathers trending items for a topic
// from free public sources and extracts the trending words/phrases among them.
// Run: node server.js   then open http://localhost:3000

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
    .replace(/&apos;|&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, "&");
}

function stripHtml(s = "") {
  return decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
// Each returns [{ source, title, text, url, time, score, meta }]

const sources = {
  async news(q, geo) {
    const lang = geo === "US" ? "en-US" : `en-${geo}`;
    const xml = await get(
      `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}&hl=${lang}&gl=${geo}&ceid=${geo}:en`,
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
    const xml = await get(`https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=top&t=day&limit=50`, "text");
    return blocks(xml, "entry").map((e) => {
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
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=60`
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
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+created:>${since}&sort=stars&order=desc&per_page=30`
    );
    // New repos impersonating paid apps ("X for Windows, download") are malware bait with bought stars
    const bait = /\b(download|unlock|activat\w*|for (windows|pc|mac)|windows 1[01]|installer)\b/i;
    const real = data.items.filter((r) => r.language && !bait.test(`${r.description} ${(r.topics || []).join(" ")}`));
    return real.map((r) => ({
      source: "GitHub",
      title: r.full_name,
      text: [r.description || "", ...(r.topics || [])].join(" "),
      url: r.html_url,
      time: r.created_at,
      score: r.stargazers_count,
      meta: `★ ${r.stargazers_count}${r.language ? " · " + r.language : ""}`,
      author: r.owner && r.owner.login,
    }));
  },

  async bluesky(q) {
    const since = daysAgo(2).toISOString();
    const data = await get(
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=top&limit=60&since=${since}`
    );
    return data.posts.map((p) => {
      const text = (p.record && p.record.text) || "";
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
    const hashtag = q.toLowerCase().replace(/[^a-z0-9]/g, "");
    const data = await get(`https://mastodon.social/api/v1/timelines/tag/${hashtag}?limit=40`);
    return data.map((s) => {
      const text = stripHtml(s.content);
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
    const t = q.toLowerCase().replace(/[^a-z0-9]/g, "");
    const data = await get(`https://dev.to/api/articles?tag=${t}&top=3&per_page=30`);
    return data.map((a) => ({
      source: "DEV",
      title: a.title,
      text: (a.description || "") + " " + (a.tag_list || []).join(" "),
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
  const matches = all.filter((t) => {
    const hay = (t.term + " " + t.news.map((n) => n.title).join(" ")).toLowerCase();
    return terms.some((w) => hay.includes(w));
  });
  return { matches, top: all };
}

// Wikipedia: find articles about the topic and flag the ones with a recent spike in views
async function wikipediaSpikes(q) {
  const search = await get(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=15&format=json&origin=*`
  );
  const titles = search.query.search.map((s) => s.title);
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
  return rows.filter(Boolean).sort((a, b) => b.change - a.change);
}

// ---------- spam filtering ----------

const SPAM = /\b(crack(ed)?|keygen|serial key|license key|activation (key|code)|direct download|free download|full version|torrent|nulled|pre-?activated|portable download)\b/i;

// Drop obvious warez spam and collapse copy-paste posts (bot networks post the same template)
function cleanItems(items) {
  const seen = new Set();
  return items.filter((it) => {
    const body = `${it.title} ${it.text || ""}`;
    if (SPAM.test(body)) return false;
    const sig = it.source + "|" + body.toLowerCase().replace(/https?:\/\/\S+|[^a-z]+/g, "").slice(0, 80);
    if (seen.has(sig)) return false;
    seen.add(sig);
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

  // Drop single words that are almost always part of a higher-ranked phrase
  const phrases = ranked.filter((t) => t.term.includes(" ")).slice(0, 25);
  const words = ranked
    .filter((t) => !t.term.includes(" "))
    .filter((w) => !phrases.some((p) => p.term.split(" ").includes(w.term) && p.count >= w.count * 0.8))
    .slice(0, 40);
  return { phrases, words };
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

  const [gt, wiki] = await Promise.allSettled([googleTrends(q, geo), wikipediaSpikes(q)]);
  const data = {
    query: q,
    geo,
    fetchedAt: new Date().toISOString(),
    status,
    terms: trendingTerms(items, q),
    googleTrends: gt.status === "fulfilled" ? gt.value : { matches: [], top: [], error: String(gt.reason) },
    wikipedia: wiki.status === "fulfilled" ? wiki.value : [],
    items,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/trends") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
      const geo = (url.searchParams.get("geo") || "US").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "US";
      if (!q) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Missing ?q=" }));
      }
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
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(path.join(__dirname, "index.html")).pipe(res);
    }
    res.writeHead(404);
    res.end("Not found");
  })
  .listen(PORT, () => console.log(`Trend Radar running at http://localhost:${PORT}`));
