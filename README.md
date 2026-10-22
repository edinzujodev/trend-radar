# Trend Radar

Type a topic ("software", "gaming", "AI"…) and see what's trending in it right now.

## Run

Needs Node.js 18+ and no `npm install`.

```bash
node server.js
```

Then open http://localhost:3000 (set `PORT=xxxx` to change the port).

## Sources (all free, no API keys)

| Source | What it gives |
|---|---|
| Google News | Headlines from the last 24h matching the topic |
| Reddit | Top posts of the day matching the topic (RSS) |
| Hacker News | Stories from the last 2 days, with points |
| GitHub | Repos created this week, by stars |
| Bluesky | Top posts from the last 2 days, with likes/reposts |
| Mastodon | Recent posts with the #topic hashtag |
| DEV | Top articles with the topic tag |
| Google Trends | Today's top searches that mention the topic |
| Wikipedia | Related articles whose page views are spiking |

X/Twitter and TikTok are not included because their APIs are paid or restricted.

## How "trending words" are picked

Every title and post is split into words and word pairs. A term ranks higher when:
- more different accounts use it (each account counts once, so spam bots can't fake a trend)
- the posts using it have more engagement
- it appears on several sites at once (the strongest signal)

Results are cached for 10 minutes per topic.
