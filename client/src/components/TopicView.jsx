import { Suspense, lazy, useState } from "react";
import { Card, Col, Empty, Flex, Row, Segmented, Skeleton, Statistic, Tabs, Typography } from "antd";
import { KEY_NAMES, SOURCES, TOP_CHART, ago, moveLabel, movers as getMovers, topOverall } from "../lib.js";
import TermList, { Move } from "./TermList.jsx";
import PostsPanel from "./PostsPanel.jsx";
import TermDrawer from "./TermDrawer.jsx";
import { GooglePanel, WikiPanel } from "./SearchPanels.jsx";
// Charts are ~1.5 MB, so they load only once results are on screen
const TopTrendsChart = lazy(() => import("./Charts.jsx").then((m) => ({ default: m.TopTrendsChart })));
const TimelineChart = lazy(() => import("./Charts.jsx").then((m) => ({ default: m.TimelineChart })));

export function SourceStatus({ status, fetchedAt }) {
  return (
    <Flex wrap gap="4px 14px" style={{ fontSize: 13 }}>
      {Object.entries(status).map(([k, v]) => v.ok ? (
        <Typography.Text key={k} type="secondary"><span className="dot" style={{ background: SOURCES[KEY_NAMES[k]] }} />{KEY_NAMES[k]} {v.count}</Typography.Text>
      ) : (
        <Typography.Text key={k} type="danger" title={v.error}>✕ {KEY_NAMES[k]} unavailable</Typography.Text>
      ))}
      <Typography.Text type="secondary">· updated {ago(fetchedAt)}</Typography.Text>
    </Flex>
  );
}

const since = (ch) => ch.comparedAt ? ago(ch.comparedAt).replace("just now", "moments ago") : null;

function Kpis({ d, moving }) {
  const ok = Object.values(d.status).filter((v) => v.ok).length;
  const top = moving[0];
  const card = (title, value, extra) => (
    <Col xs={12} lg={6}><Card size="small" style={{ height: "100%" }}><Statistic title={title} value={value} {...extra} /></Card></Col>
  );
  return (
    <Row gutter={[16, 16]}>
      {card("Posts scanned", d.items.length)}
      {card("Sites responding", ok, { suffix: `/ ${Object.keys(d.status).length}` })}
      {card("Rising or new", moving.length, { suffix: since(d.changes || {}) ? <Typography.Text type="secondary" style={{ fontSize: 13 }}>since {since(d.changes)}</Typography.Text> : null })}
      {card("Biggest riser", top ? top.term : "—", { suffix: top ? <Typography.Text type={top.prevRank === null ? undefined : "success"} style={{ fontSize: 14 }}>{moveLabel(top)}</Typography.Text> : null, styles: { content: { fontSize: 20 } } })}
    </Row>
  );
}

function Overview({ d, alerts, onPick, moving }) {
  const [kind, setKind] = useState("phrases");
  const ch = d.changes || { dropped: {} };
  const dropped = [...(ch.dropped.phrases || []), ...(ch.dropped.words || [])].slice(0, 12);
  return (
    <Flex vertical gap={16}>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={15}>
          <Card title={`Top ${TOP_CHART} trends right now`} style={{ height: "100%" }}
            extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>Click a bar for details</Typography.Text>}>
            {d.terms.words.length ? <Suspense fallback={<Skeleton active />}><TopTrendsChart terms={topOverall(d, TOP_CHART)} onPick={onPick} /></Suspense> : <Empty description="Not enough posts yet" />}
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="What's moving" style={{ height: "100%" }}
            extra={since(ch) && <Typography.Text type="secondary" style={{ fontSize: 12 }}>vs {since(ch)}</Typography.Text>}>
            {!ch.comparedAt && <Typography.Text type="secondary">Search this topic again later to see what's rising and falling.</Typography.Text>}
            {ch.comparedAt && !moving.length && <Typography.Text type="secondary">Nothing has moved much since the last check.</Typography.Text>}
            {moving.slice(0, 8).map((t) => (
              <Flex key={t.term} justify="space-between" style={{ padding: "6px 0", cursor: "pointer" }} onClick={() => onPick(t.term)}>
                <Typography.Text strong>{t.term}</Typography.Text><Move t={t} />
              </Flex>
            ))}
            {dropped.length > 0 && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
                No longer trending: {dropped.join(", ")}
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
      </Row>
      <Card title="All trending terms" extra={
        <Segmented size="small" value={kind} onChange={setKind}
          options={[{ value: "phrases", label: `Phrases ${d.terms.phrases.length}` }, { value: "words", label: `Words ${d.terms.words.length}` }]} />
      }>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {kind === "phrases" ? "Two-word phrases, usually the clearest sign of what the story is." : "Single words, ranked by how many people use them, engagement, and how many sites they're on."}
          {" "}Bar colours show which sites.
        </Typography.Paragraph>
        <Row gutter={24}>
          {[0, 1].map((half) => {
            const list = d.terms[kind];
            const mid = Math.ceil(list.length / 2);
            return (
              <Col key={half} xs={24} md={12}>
                <TermList terms={half ? list.slice(mid) : list.slice(0, mid)} max={list[0]?.score} empty={half ? "" : "Not enough overlap yet."}
                  alerts={alerts} activeTerm={null} onPick={onPick} />
              </Col>
            );
          })}
        </Row>
      </Card>
    </Flex>
  );
}

function OverTime({ d, onPick }) {
  const ch = d.changes || {};
  const tl = ch.timeline;
  const enough = tl && tl.at.length > 1;
  return (
    <Flex vertical gap={16}>
      <Card title="Top trends over time" extra={enough && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{tl.at.length} checks since {ago(tl.at[0])}</Typography.Text>}>
        {enough ? <Suspense fallback={<Skeleton active />}><TimelineChart timeline={tl} /></Suspense> : (
          <Empty description="Not enough history yet. Every search of this topic saves a check; come back later or turn on auto-refresh." />
        )}
      </Card>
      <Card title="Rising this week" extra={ch.weekly && <Typography.Text type="secondary" style={{ fontSize: 12 }}>compared with {ago(ch.weekly.since)}</Typography.Text>}>
        {!ch.weekly && <Typography.Text type="secondary">Needs a check from at least 6 hours ago.</Typography.Text>}
        {ch.weekly && !ch.weekly.rising.length && <Typography.Text type="secondary">Nothing has grown since then.</Typography.Text>}
        {ch.weekly?.rising.map((r) => (
          <Flex key={r.term} justify="space-between" align="center" gap={12} style={{ padding: "6px 0", cursor: "pointer" }} onClick={() => onPick(r.term)}>
            <Typography.Text strong>{r.term}</Typography.Text>
            <Typography.Text type="success">{r.then ? `+${Math.round((r.now / r.then - 1) * 100)}%` : "new"}</Typography.Text>
          </Flex>
        ))}
      </Card>
    </Flex>
  );
}

export default function TopicView({ data: d, alerts, activeTerm, setActiveTerm }) {
  const [tab, setTab] = useState("overview");
  const moving = getMovers(d);
  // Phrases say what the story is ("open source"); single words ("code") rarely do
  const lead = (d.terms.phrases.length >= 3 ? d.terms.phrases : topOverall(d, 3)).slice(0, 3);

  return (
    <Flex vertical gap={16}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>“{d.query}” right now</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 15, marginBottom: 8 }}>
          The biggest talking points across {Object.values(d.status).filter((v) => v.ok).length} sites in the last day or two:{" "}
          {lead.length ? lead.map((t, i) => <span key={t.term}>{i ? ", " : ""}<Typography.Link strong onClick={() => setActiveTerm(t.term)}>{t.term}</Typography.Link></span>) : "not clear yet"}.
        </Typography.Paragraph>
        <SourceStatus status={d.status} fetchedAt={d.fetchedAt} />
      </div>

      <Kpis d={d} moving={moving} />

      <Tabs activeKey={tab} onChange={setTab} size="large" items={[
        { key: "overview", label: "Overview", children: <Overview d={d} alerts={alerts} onPick={setActiveTerm} moving={moving} /> },
        { key: "posts", label: "Posts", children: <PostsPanel data={d} /> },
        { key: "search", label: "Search & Wikipedia", children: (
          <Row gutter={[16, 16]} align="top">
            <Col xs={24} md={12}><GooglePanel data={d} /></Col>
            <Col xs={24} md={12}><WikiPanel data={d} /></Col>
          </Row>
        ) },
        { key: "time", label: "Over time", children: <OverTime d={d} onPick={setActiveTerm} /> },
      ]} />

      <TermDrawer data={d} term={activeTerm} onClose={() => setActiveTerm(null)} />
    </Flex>
  );
}
