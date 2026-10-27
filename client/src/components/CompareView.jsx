import { Card, Col, Empty, Flex, Row, Tag, Typography } from "antd";
import { KEY_NAMES, ago, allTerms, fmt } from "../lib.js";

const A = { color: "var(--cmp-a)" }, B = { color: "var(--cmp-b)" };

function Chips({ list, empty }) {
  if (!list.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
  return <Flex gap={6} wrap>{list.map((t) => <Tag key={t} style={{ marginInlineEnd: 0 }}>{t}</Tag>)}</Flex>;
}

export default function CompareView({ a, b }) {
  // Per site, compare engagement where the site reports it, otherwise post counts.
  // Post counts are capped by each API's page size, so engagement is the better signal.
  const rows = Object.entries(KEY_NAMES).map(([k, s]) => {
    const pa = a.items.filter((i) => i.source === s), pb = b.items.filter((i) => i.source === s);
    const ea = pa.reduce((n, i) => n + (i.score || 0), 0), eb = pb.reduce((n, i) => n + (i.score || 0), 0);
    const useEng = ea + eb > 0;
    const va = useEng ? ea : pa.length, vb = useEng ? eb : pb.length;
    const failed = !a.status[k].ok || !b.status[k].ok;
    return { s, pa: pa.length, pb: pb.length, ea, eb, useEng, share: va + vb ? va / (va + vb) : null, failed };
  });
  const counted = rows.filter((r) => r.share !== null && !r.failed);
  const overall = counted.length ? counted.reduce((n, r) => n + r.share, 0) / counted.length : 0.5;
  const pct = Math.round(overall * 100);

  const scores = (d) => new Map(allTerms(d).map((t) => [t.term, t.score]));
  const sa = scores(a), sb = scores(b);
  const maxA = Math.max(1, ...sa.values()), maxB = Math.max(1, ...sb.values());
  const shared = [...sa.keys()].filter((t) => sb.has(t))
    .sort((x, y) => (sb.get(y) / maxB + sa.get(y) / maxA) - (sb.get(x) / maxB + sa.get(x) / maxA)).slice(0, 20);
  const only = (m, other) => [...m.entries()].filter(([t]) => !other.has(t)).sort((x, y) => y[1] - x[1]).slice(0, 20).map(([t]) => t);

  return (
    <>
      <Typography.Paragraph type="secondary">
        Comparing <b style={A}>{a.query}</b> and <b style={B}>{b.query}</b> · updated {ago(a.fetchedAt)}
      </Typography.Paragraph>
      <Card title="Who's getting more attention">
        <Typography.Paragraph style={{ fontSize: 17 }}>
          {pct === 50 ? "Even split" : pct > 50 ? <><span style={A}>{a.query}</span> leads</> : <><span style={B}>{b.query}</span> leads</>}:{" "}
          <span style={A}>{pct}%</span> vs <span style={B}>{100 - pct}%</span>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}> · averaged over {counted.length} sites</Typography.Text>
        </Typography.Paragraph>
        <Flex justify="space-between" style={{ fontWeight: 700, marginBottom: 6 }}><span style={A}>{a.query}</span><span style={B}>{b.query}</span></Flex>
        {rows.map((r) => {
          const label = (n, e) => `${n} posts${r.useEng ? ` · ${fmt(e)} engagement` : ""}`;
          const w = r.share === null ? 0 : r.share * 100;
          return (
            <Row key={r.s} gutter={12} align="middle" style={{ padding: "6px 0", fontSize: 13 }}>
              <Col flex="110px">{r.s}</Col>
              <Col flex="auto">
                <div className="bar thick">
                  {r.share !== null && !r.failed && <><i style={{ width: `${w}%`, background: "var(--cmp-a)" }} /><i style={{ width: `${100 - w}%`, background: "var(--cmp-b)" }} /></>}
                </div>
                <Flex justify="space-between">
                  {r.failed ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>unavailable for one topic</Typography.Text> : <>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label(r.pa, r.ea)}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label(r.pb, r.eb)}</Typography.Text>
                  </>}
                </Flex>
              </Col>
            </Row>
          );
        })}
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>
          Google Trends: {a.googleTrends.matches.length} of today's top searches mention {a.query}, {b.googleTrends.matches.length} mention {b.query}.
        </Typography.Paragraph>
      </Card>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }} align="top">
        <Col xs={24} lg={8}><Card title={<span style={A}>Only in {a.query}</span>}><Chips list={only(sa, sb)} empty="Nothing unique." /></Card></Col>
        <Col xs={24} lg={8}>
          <Card title="Trending in both">
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>Words and phrases both topics are talking about.</Typography.Paragraph>
            <Chips list={shared} empty="No overlap right now." />
          </Card>
        </Col>
        <Col xs={24} lg={8}><Card title={<span style={B}>Only in {b.query}</span>}><Chips list={only(sb, sa)} empty="Nothing unique." /></Card></Col>
      </Row>
    </>
  );
}
