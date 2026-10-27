import { useState } from "react";
import { Button, Empty, Flex, Segmented, Tag, Typography, theme } from "antd";
import { PER_SOURCE, PER_SOURCE_MAX, SOURCES, ago, escRe } from "../lib.js";

function Highlight({ text, term }) {
  if (!term) return text;
  const re = new RegExp(`(${escRe(term).replace(/ /g, "\\W+")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export const SourceTag = ({ s }) => <Tag style={{ background: SOURCES[s], color: "#fff", border: 0, fontWeight: 700 }}>{s}</Tag>;

export function PostRow({ i, term, showSource }) {
  const { token } = theme.useToken();
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${token.colorBorderSecondary}` }}>
      {showSource && <SourceTag s={i.source} />}
      <Typography.Link href={i.url} target="_blank" rel="noopener" style={{ fontWeight: 550, overflowWrap: "anywhere", color: token.colorText }}>
        <Highlight text={i.title} term={term} />
      </Typography.Link>
      <div><Typography.Text type="secondary" style={{ fontSize: 12.5 }}>{i.meta}{i.meta ? " · " : ""}{ago(i.time)}</Typography.Text></div>
    </div>
  );
}

// Each site's own top posts by trending score (scores only compare within a site)
export default function PostsPanel({ data }) {
  const [source, setSource] = useState("All");
  const [open, setOpen] = useState({}); // site -> showing all 20
  const counts = {};
  data.items.forEach((i) => (counts[i.source] = (counts[i.source] || 0) + 1));
  const sites = Object.keys(SOURCES).filter((s) => counts[s]);
  const groups = (source === "All" ? sites : [source])
    .map((s) => ({ s, list: data.items.filter((i) => i.source === s).sort((a, b) => b.trend - a.trend) }));

  return (
    <>
      <Typography.Paragraph type="secondary">Each site's posts sorted by how fast they're gaining engagement. Reddit keeps its own "top today" order; news stories rank by how many trending terms they mention.</Typography.Paragraph>
      <Segmented value={source} onChange={setSource} style={{ marginBottom: 8, maxWidth: "100%", overflowX: "auto" }}
        options={[{ value: "All", label: `All ${data.items.length}` }, ...sites.map((s) => ({ value: s, label: `${s} ${counts[s]}` }))]} />
      {!groups.length && <Empty description="No posts" />}
      {groups.map(({ s, list }) => {
        const n = source !== "All" || open[s] ? PER_SOURCE_MAX : PER_SOURCE;
        return (
          <div key={s} style={{ marginTop: 20 }}>
            <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
              <SourceTag s={s} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>top {Math.min(n, list.length)} of {list.length}</Typography.Text>
            </Flex>
            {list.slice(0, n).map((i) => <PostRow key={i.id} i={i} />)}
            {source === "All" && list.length > PER_SOURCE && (
              <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => setOpen((o) => ({ ...o, [s]: !o[s] }))}>
                {open[s] ? "Show fewer" : `Show more from ${s}`}
              </Button>
            )}
          </div>
        );
      })}
    </>
  );
}
