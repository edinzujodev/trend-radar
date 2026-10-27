import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntApp, Alert, Flex, Input, Layout, Select, Spin, Switch, Tooltip, Typography, theme } from "antd";
import { RiseOutlined } from "@ant-design/icons";
import { ALERT_TOP, COUNTRIES, REFRESH_MS, allTerms, fetchTrends, splitCompare, topTerms } from "./lib.js";
import TopicView from "./components/TopicView.jsx";
import CompareView from "./components/CompareView.jsx";

const TITLE = document.title;
const params = new URLSearchParams(location.search);

// The page opens on worldwide trends; typing a topic only narrows them down
export default function App() {
  const { notification } = AntApp.useApp();
  const { token } = theme.useToken();
  const [q, setQ] = useState(params.get("q") || "");
  const [geo, setGeo] = useState(params.get("geo") || "US");
  const [auto, setAuto] = useState(false);
  const [state, setState] = useState({ status: "loading", query: params.get("q") || "" }); // loading | error | topic | compare
  const [alerts, setAlerts] = useState(new Set());
  const [activeTerm, setActiveTerm] = useState(null);
  const current = useRef(state);
  current.current = state;
  const fillTimer = useRef(null);

  // silent = an auto-refresh: keep the reader's place and flag terms new to the top 10.
  // fill = re-asking for a site that was rate-limited: same as silent, but no alerts.
  const search = useCallback(async (query, country, { silent = false, fill = false } = {}) => {
    query = query.trim();
    clearTimeout(fillTimer.current);
    if (!silent) {
      const qs = new URLSearchParams({ ...(query && { q: query }), ...(country !== "US" && { geo: country }) }).toString();
      history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
      setState({ status: "loading", query });
    }
    try {
      const pair = splitCompare(query);
      if (pair.length === 2) {
        const [a, b] = await Promise.all(pair.map((p) => fetchTrends(p, country)));
        return setState({ status: "compare", a, b });
      }
      const next = await fetchTrends(query, country);
      if (next.retryIn) fillTimer.current = setTimeout(() => search(query, country, { silent: true, fill: true }), (next.retryIn + 3) * 1000);
      const prev = current.current;
      if (fill && prev.status === "topic" && prev.data.query === next.query) {
        setActiveTerm((t) => (allTerms(next).some((x) => x.term === t) ? t : null));
      } else if (silent && prev.status === "topic" && prev.data.query === next.query) {
        const before = topTerms(prev.data);
        const fresh = [...topTerms(next)].filter((t) => !before.has(t));
        setAlerts(new Set(fresh));
        if (fresh.length) notify(query, fresh);
        setActiveTerm((t) => (allTerms(next).some((x) => x.term === t) ? t : null));
      } else {
        setAlerts(new Set()); setActiveTerm(null);
      }
      setState({ status: "topic", data: next });
    } catch (e) {
      if (!silent) setState({ status: "error", message: e.message });
    }
  }, []);

  function notify(query, terms) {
    if (document.hidden) document.title = `(${terms.length}) ${TITLE}`;
    notification.warning({ title: `New in the top ${ALERT_TOP}`, description: terms.join(", "), duration: 0 });
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(`New in ${query ? `“${query}”` : "worldwide"} top ${ALERT_TOP}`, { body: terms.join(", ") });
  }

  useEffect(() => { search(q, geo); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- first load

  useEffect(() => {
    const reset = () => { if (!document.hidden) document.title = TITLE; };
    document.addEventListener("visibilitychange", reset);
    return () => document.removeEventListener("visibilitychange", reset);
  }, []);

  // Latest filter/country for the timer without restarting it on every keystroke
  const latest = useRef({ q, geo });
  latest.current = { q: state.status === "topic" ? state.data.query : q, geo };
  useEffect(() => {
    if (!auto) return;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    const id = setInterval(() => search(latest.current.q, latest.current.geo, { silent: true }), REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, search]);

  const run = (query = q) => { setQ(query); search(query, geo); };
  const changeGeo = (g) => { setGeo(g); search(state.status === "topic" ? state.data.query : q, g); };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <header style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, padding: "10px 16px" }}>
        <Flex wrap gap={12} align="center" justify="space-between" style={{ maxWidth: 1168, margin: "0 auto" }}>
          <Typography.Link onClick={() => run("")} style={{ color: token.colorText, fontSize: 17, fontWeight: 600 }}>
            <RiseOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />Trend Radar
          </Typography.Link>
          <Flex wrap gap={8} align="center" style={{ flex: "1 1 420px", justifyContent: "flex-end" }}>
            <Input.Search value={q} allowClear placeholder="Filter by topic, or compare: AI vs crypto" style={{ flex: "1 1 220px", maxWidth: 360 }}
              onChange={(e) => setQ(e.target.value)} onSearch={(v) => run(v)} />
            <Select value={geo} onChange={changeGeo} style={{ width: 150 }} title="Country for news and Google searches"
              options={COUNTRIES.map(([value, label]) => ({ value, label }))} />
            <Tooltip title="Re-check every 10 minutes and flag anything new in the top 10">
              <Flex gap={6} align="center"><Switch size="small" checked={auto} onChange={setAuto} /><Typography.Text type="secondary">Auto-refresh</Typography.Text></Flex>
            </Tooltip>
          </Flex>
        </Flex>
      </header>
      <div className="wrap">
        {state.status === "loading" && (
          <Flex vertical align="center" gap={12} style={{ padding: 64 }}>
            <Spin size="large" />
            <Typography.Text type="secondary">
              {state.query ? `Gathering trends for “${state.query}”…` : "Gathering what's trending worldwide…"}
            </Typography.Text>
          </Flex>
        )}
        {state.status === "error" && <Alert type="error" showIcon title="Something went wrong" description={state.message} />}
        {state.status === "topic" && (
          <TopicView data={state.data} alerts={alerts} activeTerm={activeTerm} setActiveTerm={setActiveTerm} onFilter={run} />
        )}
        {state.status === "compare" && <CompareView a={state.a} b={state.b} />}
      </div>
    </Layout>
  );
}
