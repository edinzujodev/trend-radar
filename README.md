# Trend Radar

Type a topic ("software", "gaming", "AI"…) and see what's trending in it right now.

## Run

Needs Node.js 18+ and no `npm install`.

```bash
node server.js
```

Then open http://localhost:3000 (to change the port, copy `.env.example` to `.env` and edit `PORT`).

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

## How "trending words" are picked

Every title and post is split into words and word pairs. A term ranks higher when:
- more different accounts use it (each account counts once, so spam bots can't fake a trend)
- the posts using it have more engagement
- it appears on several sites at once (the strongest signal)

Results are cached for 10 minutes per topic.

## Features

- **Rising and falling.** Every fresh fetch saves the ranked term lists to `data/history.json` (git-ignored). The next search for the same topic marks terms as NEW, ▲ or ▼ and lists what dropped off, compared with the last check that's at least an hour old (or the latest one if there's none that old).
- **Trending posts per site.** Each site shows its top 20 posts by how fast they're gaining engagement. Reddit keeps its own "top today" order; Google News stories are ranked by how many trending terms they contain.
- **Compare two topics.** Search `AI vs crypto` to see which gets more attention on each site, the terms they share, and the terms unique to each.
- **Auto-refresh.** Tick *Auto-refresh* to re-check every 10 minutes. Terms that newly enter the top 10 are flagged on the page, in the tab title, and as a browser notification if you allow it.

Topics with more than one word work on the hashtag-only sites (Mastodon, DEV): `machine learning` searches #machinelearning, plus each word's tag filtered to posts that contain every word.
