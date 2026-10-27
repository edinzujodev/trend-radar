# Trend Radar

Type a topic ("software", "gaming", "AI"…) and see what's trending in it right now.

## Run

Needs Node.js 20.19+.

```bash
npm install
npm run dev                  # development, with live reload
npm run build && npm start   # production
```

Then open http://localhost:3000 (to change the port, copy `.env.example` to `.env` and edit `PORT`).

## Project layout

| Path | What it is |
|---|---|
| `server.js` | Node server: fetches the sources, ranks the trends, serves `/api/trends`. No runtime dependencies. |
| `client/` | React front end built with [Ant Design](https://ant.design/) and Vite |
| `dist/` | The built front end (`npm run build`), served by `npm start`. Git-ignored. |
| `data/history.json` | Saved rankings for the rising/falling markers. Git-ignored. |

In development, `server.js --dev` runs Vite inside the same server, so there's one port and no proxy to set up.

## Sources (all free, no API keys)

| Source | What it gives |
|---|---|
| Google News | Headlines from the last 24h matching the topic |
| Reddit | Top posts of the day matching the topic (RSS) |
| Hacker News | Stories from the last 2 days, with points |
| GitHub | Repos created this week, by stars |
| Bluesky | Top English posts from the last 2 days, with likes/reposts |
| Mastodon | Recent English posts with the #topic hashtag |
| DEV | Top articles with the topic tag |
| Google Trends | Today's top searches, with the ones about the topic first |
| Wikipedia | Related articles whose page views are spiking |

X/Twitter and TikTok are not included because their APIs are paid or restricted.

Reddit allows only about one request a minute without an account, so its answers are kept for 30 minutes and its rate-limit headers are respected. If a topic is searched while Reddit is still limited, the page shows the rest straight away and fills Reddit in automatically once the limit resets. Any site that fails falls back to its last good answer for that topic, marked with its age.

## How "trending words" are picked

Every title and post is split into words and word pairs. A term ranks higher when:
- more different accounts use it (each account counts once, so spam bots can't fake a trend)
- the posts using it have more engagement
- it appears on several sites at once (the strongest signal)

Results are cached for 10 minutes per topic.

## Features

- **Worldwide first.** The page opens on what's trending everywhere: Google News top stories, r/popular, the Hacker News front page, this week's top new GitHub repos, Bluesky's "What's Hot" feed, Mastodon's trending posts, DEV's top articles, Google's top searches and Wikipedia's most-read articles, plus the trending lists Bluesky, Mastodon and Google publish themselves. The search box in the header only narrows this down to a topic.
- **Dashboard.** Headline numbers, a top-10 trends chart and a "What's moving" list, with tabs for *Posts*, *Search & Wikipedia* and *Over time*. Click any trend for a side panel with where it comes from, its history and the posts behind it.
- **Rising and falling.** Every fresh fetch saves the ranked terms and their scores to `data/history.json` (git-ignored; set `HISTORY_FILE` to store it elsewhere). The next search for the same topic marks terms as NEW, ▲ or ▼ and lists what dropped off, compared with the last check that's at least an hour old. Checks less than 30 minutes apart replace each other, so the file keeps about two weeks.
- **Over time.** A line chart of the top terms across the last 7 days of checks, and "Rising this week": what grew most since the oldest check from that week. History only builds while the topic gets searched, so leave *Auto-refresh* on or search it regularly.
- **Trending posts per site.** Each site shows its top 5 posts (up to 20 with *Show more*) by how fast they're gaining engagement. Reddit keeps its own "top today" order; Google News stories are ranked by how many trending terms they contain.
- **Spam filtering.** A term needs two sites or three different people. Copy-paste posts are collapsed even when their titles differ, GitHub tag lists never form phrases, and repos posing as downloads, cheats or spoofers are dropped.
- **Compare two topics.** Search `AI vs crypto` to see which gets more attention on each site, the terms they share, and the terms unique to each.
- **Auto-refresh.** Tick *Auto-refresh* to re-check every 10 minutes. Terms that newly enter the top 10 are flagged on the page, in the tab title, and as a browser notification if you allow it.

Topics with more than one word work on the hashtag-only sites (Mastodon, DEV): `machine learning` searches #machinelearning, plus each word's tag filtered to posts that contain every word.
