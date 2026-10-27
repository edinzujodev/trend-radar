import { useRef } from "react";
import { Avatar, Card, Col, Flex, Grid, Row, Typography } from "antd";
import { KEY_NAMES, SOURCES, ago } from "../lib.js";
import TermList, { Move } from "./TermList.jsx";
import PostsPanel from "./PostsPanel.jsx";
import { GooglePanel, WikiPanel } from "./SearchPanels.jsx";

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

function Section({ n, title, children }) {
  return (
    <section style={{ marginTop: 32 }}>
      <Flex align="center" gap={10} style={{ marginBottom: 4 }}>
        <Avatar size={28} style={{ background: "var(--cmp-a)", flex: "none" }}>{n}</Avatar>
        <Typography.Title level={4} style={{ margin: 0 }}>{title}</Typography.Title>
      </Flex>
      {children}
    </section>
  );
}

function Dropped({ list }) {
  if (!list || !list.length) return null;
  return <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, margin: "10px 8px 0" }}>No longer trending: {list.join(", ")}</Typography.Paragraph>;
}

export default function TopicView({ data: d, alerts, activeTerm, setActiveTerm, activeSource, setActiveSource }) {
  const posts = useRef(null);
  const screens = Grid.useBreakpoint();
  const { phrases, words } = d.terms;
  const ch = d.changes || { comparedAt: null, dropped: {} };

  // At a glance: the top few terms and what's moving, in plain words
  const ok = Object.values(d.status).filter((v) => v.ok).length;
  const lead = (phrases.length ? phrases : words).slice(0, 3);
  const movers = [...phrases.slice(0, 12), ...words.slice(0, 25)]
    .filter((t) => t.prevRank === null || t.prevRank - t.rank >= 3)
    .sort((a, b) => (b.prevRank === null) - (a.prevRank === null) || (b.prevRank - b.rank) - (a.prevRank - a.rank))
    .slice(0, 4);

  const pick = (term) => {
    setActiveTerm(term);
    if (term && !screens.lg) posts.current?.scrollIntoView({ behavior: "smooth" });
  };
  const termProps = { alerts, activeTerm, onPick: pick };

  return (
    <>
      <Card title={`“${d.query}” right now`}>
        <Typography.Paragraph style={{ fontSize: 17 }}>
          Across {d.items.length} posts from {ok} sites in the last day or two, the biggest talking points are{" "}
          {lead.length ? lead.map((t, i) => <span key={t.term}>{i ? ", " : ""}<b>{t.term}</b></span>) : "still unclear (not enough overlap)"}.
        </Typography.Paragraph>
        {movers.length > 0 && (
          <Typography.Paragraph>
            Moving fastest: {movers.map((t, i) => <span key={t.term}>{i ? " · " : ""}<b>{t.term}</b><Move t={t} /></span>)}
          </Typography.Paragraph>
        )}
        <SourceStatus status={d.status} fetchedAt={d.fetchedAt} />
      </Card>

      <Section n={1} title="What people are saying">
        <Typography.Paragraph type="secondary" style={{ maxWidth: 900 }}>
          Words and phrases that keep coming up in posts about “{d.query}”, next to the posts themselves. Click a word to see only the posts that use it.
          <br />
          <span style={{ fontSize: 12.5 }}>
            Longer bar = stronger trend · bar colours = which sites
            {ch.comparedAt && ` · ▲▼ and NEW = change since the check ${ago(ch.comparedAt).replace("just now", "moments ago")}`}
          </span>
        </Typography.Paragraph>
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} lg={9}>
            <Flex vertical gap={16}>
              <Card title="Trending phrases">
                <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>Two-word phrases. Usually the clearest sign of what the story is.</Typography.Paragraph>
                <TermList terms={phrases.slice(0, 12)} empty="Not enough overlap yet." {...termProps} />
                <Dropped list={ch.dropped.phrases} />
              </Card>
              <Card title="Trending words">
                <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                  Single words, ranked by how many people use them, how much engagement those posts get, and how many sites they're on.
                </Typography.Paragraph>
                <TermList terms={words.slice(0, 25)} empty="No words yet." {...termProps} />
                <Dropped list={ch.dropped.words} />
              </Card>
            </Flex>
          </Col>
          <Col xs={24} lg={15}>
            <PostsPanel ref={posts} data={d} activeTerm={activeTerm} clearTerm={() => setActiveTerm(null)}
              activeSource={activeSource} setActiveSource={setActiveSource} />
          </Col>
        </Row>
      </Section>

      <Section n={2} title="What people are searching and reading">
        <Typography.Paragraph type="secondary">Signals from outside social media: what's spiking on Google and Wikipedia.</Typography.Paragraph>
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} md={12}><GooglePanel data={d} /></Col>
          <Col xs={24} md={12}><WikiPanel data={d} /></Col>
        </Row>
      </Section>
    </>
  );
}
