import { Card, Collapse, Flex, Typography } from "antd";
import { fmt } from "../lib.js";

function GtRow({ m }) {
  return (
    <div style={{ padding: "8px 0", borderTop: "1px solid var(--bar-bg)" }}>
      <Typography.Link strong href={`https://www.google.com/search?q=${encodeURIComponent(m.term)}`} target="_blank">{m.term}</Typography.Link>
      <Typography.Text type="secondary" style={{ fontSize: 12.5, marginLeft: 6 }}>{m.traffic} searches</Typography.Text>
      {m.news[0] && (
        <div style={{ fontSize: 12.5 }}>
          <Typography.Link href={m.news[0].url} target="_blank" type="secondary">{m.news[0].title}</Typography.Link>
          <Typography.Text type="secondary"> · {m.news[0].source}</Typography.Text>
        </div>
      )}
    </div>
  );
}

export function GooglePanel({ data }) {
  const gt = data.googleTrends;
  const matched = new Set(gt.matches.map((m) => m.term));
  // Unrelated top searches are context, not results, so they're folded away
  const others = gt.top.filter((t) => !matched.has(t.term));
  const fold = (label) => others.length > 0 && (
    <Collapse ghost size="small" style={{ marginTop: 8 }}
      items={[{ key: "o", label, children: others.map((m) => <GtRow key={m.term} m={m} />) }]} />
  );
  return (
    <Card title={`Google searches today (${data.geo})`}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        {data.query ? "Today's top Google searches that mention your topic" : "Today's top Google searches"}, with the news story behind each.
      </Typography.Paragraph>
      {gt.matches.length ? (
        <>{gt.matches.map((m) => <GtRow key={m.term} m={m} />)}{fold("Other top searches today")}</>
      ) : (
        <>
          <Typography.Text type="secondary">None of today's top Google searches are about “{data.query}”.</Typography.Text>
          {fold("Show today's top searches anyway")}
        </>
      )}
    </Card>
  );
}

function Spark({ series }) {
  const max = Math.max(...series), min = Math.min(...series), w = 70, h = 22;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`).join(" ");
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke="var(--cmp-a)" strokeWidth="1.5" /></svg>;
}

export function WikiPanel({ data }) {
  const world = !data.query;
  return (
    <Card title={world ? "Most-read on Wikipedia" : "Wikipedia interest"}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        {world ? "Yesterday's most-read English articles, with views compared with the 2 weeks before." : "Related articles: views over the last 2 days compared with the 2 weeks before."} Green = rising.
      </Typography.Paragraph>
      {!data.wikipedia.length && <Typography.Text type="secondary">No Wikipedia data.</Typography.Text>}
      {data.wikipedia.slice(0, 8).map((w) => {
        const pct = Math.round((w.change - 1) * 100);
        return (
          <Flex key={w.url} align="center" gap={8} style={{ padding: "5px 0" }}>
            <Typography.Link href={w.url} target="_blank" style={{ flex: 1 }}>{w.title}</Typography.Link>
            {world && <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmt(w.views)} views</Typography.Text>}
            <Spark series={w.series} />
            <Typography.Text strong={pct >= 15} type={pct >= 15 ? "success" : "secondary"} style={{ width: 52, textAlign: "right", fontSize: 12.5 }}>
              {pct >= 0 ? "+" : ""}{pct}%
            </Typography.Text>
          </Flex>
        );
      })}
    </Card>
  );
}
