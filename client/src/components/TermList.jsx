import { Flex, Tag, Typography, theme } from "antd";
import { SOURCES } from "../lib.js";

// Movement since the snapshot the server compared against (undefined = no history yet)
export function Move({ t }) {
  if (t.prevRank === undefined) return null;
  if (t.prevRank === null) return <Tag color="blue" style={{ marginInline: 6 }}>NEW</Tag>;
  const d = t.prevRank - t.rank;
  if (!d) return null;
  return <Typography.Text strong type={d > 0 ? "success" : "danger"} style={{ fontSize: 12, marginLeft: 6 }}>{d > 0 ? `▲${d}` : `▼${-d}`}</Typography.Text>;
}

// Bar length = score relative to the top term; one segment per site that uses the term
// `max` lets a list split over two columns share one scale
export default function TermList({ terms, alerts, activeTerm, onPick, empty, max: maxScore }) {
  const { token } = theme.useToken();
  if (!terms.length) return <Typography.Text type="secondary">{empty}</Typography.Text>;
  const max = Math.max(1, maxScore || 0, ...terms.map((t) => t.score));
  return terms.map((t) => {
    const share = (t.score / max) * 100;
    const on = activeTerm === t.term;
    return (
      <div key={t.term} className={`term${alerts.has(t.term) ? " alert" : ""}`} onClick={() => onPick(on ? null : t.term)}
        style={{ background: on ? token.controlItemBgActive : undefined }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = token.controlItemBgHover; }}
        onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = ""; }}>
        <Flex justify="space-between" align="baseline" gap={8}>
          <span style={{ overflowWrap: "anywhere" }}><Typography.Text strong>{t.term}</Typography.Text><Move t={t} /></span>
          <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {t.count} posts · {t.sources.length} site{t.sources.length > 1 ? "s" : ""}
          </Typography.Text>
        </Flex>
        <div className="bar" style={{ marginTop: 4 }}>
          {t.sources.map((s) => <i key={s} style={{ width: `${share / t.sources.length}%`, background: SOURCES[s] }} />)}
        </div>
      </div>
    );
  });
}
