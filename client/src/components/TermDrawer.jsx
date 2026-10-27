import { Suspense, lazy } from "react";
import { Card, Col, Drawer, Flex, Row, Skeleton, Statistic, Typography } from "antd";
import { SOURCES, allTerms } from "../lib.js";
import { Move } from "./TermList.jsx";
import { PostRow } from "./PostsPanel.jsx";

// Charts are ~1.5 MB, so they load only once results are on screen
const TimelineChart = lazy(() => import("./Charts.jsx").then((m) => ({ default: m.TimelineChart })));

// Everything about one term: where it comes from, how it moved, and the posts behind it
export default function TermDrawer({ data, term, onClose }) {
  const t = term && allTerms(data).find((x) => x.term === term);
  const ids = new Set(t ? t.items : []);
  const posts = data.items.filter((i) => ids.has(i.id)).sort((a, b) => b.trend - a.trend);
  const bySite = Object.keys(SOURCES).map((s) => ({ s, n: posts.filter((i) => i.source === s).length })).filter((x) => x.n);
  const max = Math.max(1, ...bySite.map((x) => x.n));
  const tl = data.changes?.timeline;
  const tracked = tl && tl.at.length > 1 && tl.series.some((s) => s.term === term);

  return (
    <Drawer open={!!t} onClose={onClose} size="large" title={t && <span>{t.term}<Move t={t} /></span>}>
      {t && (
        <Flex vertical gap={16}>
          <Row gutter={12}>
            <Col span={8}><Statistic title="People posting" value={t.count} /></Col>
            <Col span={8}><Statistic title="Sites" value={t.sources.length} /></Col>
            <Col span={8}><Statistic title="Rank" value={t.rank} prefix="#" /></Col>
          </Row>
          <Card size="small" title="Where it's coming from">
            {bySite.map(({ s, n }) => (
              <Flex key={s} align="center" gap={10} style={{ padding: "3px 0" }}>
                <span style={{ width: 96, fontSize: 13 }}>{s}</span>
                <div className="bar thick" style={{ flex: 1 }}><i style={{ width: `${(n / max) * 100}%`, background: SOURCES[s] }} /></div>
                <Typography.Text type="secondary" style={{ width: 56, textAlign: "right", fontSize: 12 }}>{n} post{n > 1 ? "s" : ""}</Typography.Text>
              </Flex>
            ))}
          </Card>
          {tracked && <Card size="small" title="Over the last checks"><Suspense fallback={<Skeleton active />}><TimelineChart timeline={tl} highlight={term} height={180} /></Suspense></Card>}
          <Card size="small" title={`Posts mentioning “${t.term}”`}>
            {posts.map((i) => <PostRow key={i.id} i={i} term={t.term} showSource />)}
          </Card>
        </Flex>
      )}
    </Drawer>
  );
}
