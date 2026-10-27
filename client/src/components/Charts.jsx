import { Bar, Line } from "@ant-design/charts";
import { moveLabel, useDark } from "../lib.js";

// Top trends as one horizontal bar chart; clicking a bar opens that term
export function TopTrendsChart({ terms, onPick }) {
  const dark = useDark();
  const data = terms.map((t) => ({ term: t.term, label: `${t.term}  ${moveLabel(t)}`.trim(), score: t.score, sites: t.sources.length, posts: t.count }));
  return (
    <Bar
      data={data} xField="label" yField="score" height={Math.max(240, data.length * 34)}
      theme={dark ? "classicDark" : "classic"}
      style={{ fill: "#3b5bdb", radiusTopRight: 4, radiusBottomRight: 4, cursor: "pointer", maxWidth: 22 }}
      axis={{ x: { title: false }, y: { title: "Trend score", grid: true } }}
      tooltip={{ title: "term", items: [{ field: "posts", name: "Posts" }, { field: "sites", name: "Sites" }] }}
      onEvent={(_, e) => { if (e.type === "element:click" && e.data?.data) onPick(e.data.data.term); }}
    />
  );
}

// Each tracked term's score over the saved checks
export function TimelineChart({ timeline, highlight, height = 320 }) {
  const dark = useDark();
  const series = highlight ? timeline.series.filter((s) => s.term === highlight) : timeline.series;
  const data = series.flatMap((s) => s.scores.map((score, i) => ({ at: new Date(timeline.at[i]), term: s.term, score: score || 0 })));
  return (
    <Line
      data={data} xField="at" yField="score" colorField="term" height={height}
      theme={dark ? "classicDark" : "classic"}
      shapeField="smooth" point={{ size: 2 }}
      axis={{ x: { title: false, labelFormatter: (d) => new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }) }, y: { title: "Trend score" } }}
      legend={highlight ? false : { color: { position: "bottom" } }}
    />
  );
}
