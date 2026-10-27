import { forwardRef } from "react";
import { Card, Empty, Flex, Tag, Typography, theme } from "antd";
import { PER_SOURCE, SOURCES, ago, allTerms } from "../lib.js";

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function Highlight({ text, term }) {
  if (!term) return text;
  const re = new RegExp(`(${escRe(term).replace(/ /g, "\\W+")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

const PostsPanel = forwardRef(function PostsPanel({ data, activeTerm, clearTerm, activeSource, setActiveSource }, ref) {
  const { token } = theme.useToken();
  let items = data.items;
  if (activeTerm) {
    const t = allTerms(data).find((x) => x.term === activeTerm);
    const ids = new Set(t ? t.items : []);
    items = items.filter((i) => ids.has(i.id));
  }
  const counts = { All: items.length };
  items.forEach((i) => (counts[i.source] = (counts[i.source] || 0) + 1));
  if (activeSource !== "All") items = items.filter((i) => i.source === activeSource);

  // Each site gets its own top 20 by trending score (scores only compare within a site)
  const groups = Object.keys(SOURCES)
    .map((s) => ({ s, list: items.filter((i) => i.source === s).sort((a, b) => b.trend - a.trend).slice(0, PER_SOURCE) }))
    .filter((g) => g.list.length);

  return (
    <div ref={ref}><Card title="Trending posts">
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Top {PER_SOURCE} per site, sorted by how fast they're gaining engagement.
      </Typography.Paragraph>
      {activeTerm && (
        <Typography.Paragraph type="secondary">
          Showing posts that mention <Typography.Text strong>{activeTerm}</Typography.Text> ·{" "}
          <Typography.Link onClick={clearTerm}>clear</Typography.Link>
        </Typography.Paragraph>
      )}
      <Flex gap={6} wrap style={{ marginBottom: 8 }}>
        {["All", ...Object.keys(SOURCES)].filter((s) => counts[s]).map((s) => (
          <Tag.CheckableTag key={s} checked={activeSource === s} onChange={() => setActiveSource(s)}>{s} {counts[s]}</Tag.CheckableTag>
        ))}
      </Flex>
      {!groups.length && <Empty description="No posts" />}
      {groups.map((g) => (
        <div key={g.s} style={{ marginTop: 16 }}>
          <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
            <Tag style={{ background: SOURCES[g.s], color: "#fff", border: 0, fontWeight: 700 }}>{g.s}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>top {g.list.length} of {counts[g.s]}</Typography.Text>
          </Flex>
          {g.list.map((i) => (
            <div key={i.id} style={{ padding: "10px 0", borderTop: "1px solid var(--bar-bg)" }}>
              <Typography.Link href={i.url} target="_blank" rel="noopener" style={{ fontWeight: 550, overflowWrap: "anywhere", color: token.colorText }}>
                <Highlight text={i.title} term={activeTerm} />
              </Typography.Link>
              <div><Typography.Text type="secondary" style={{ fontSize: 12.5 }}>{i.meta}{i.meta ? " · " : ""}{ago(i.time)}</Typography.Text></div>
            </div>
          ))}
        </div>
      ))}
    </Card></div>
  );
});

export default PostsPanel;
