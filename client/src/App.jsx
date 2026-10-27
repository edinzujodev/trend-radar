import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntApp, Alert, Button, Flex, Input, Layout, Menu, Select, Spin, Switch, Tooltip, Typography, theme } from "antd";
import { RiseOutlined, SearchOutlined } from "@ant-design/icons";
import { ALERT_TOP, COUNTRIES, PRESETS, REFRESH_MS, allTerms, fetchTrends, splitCompare, topTerms } from "./lib.js";
import TopicView from "./components/TopicView.jsx";
import CompareView from "./components/CompareView.jsx";

const TITLE = document.title;
const params = new URLSearchParams(location.search);

export default function App() {
  const { notification } = AntApp.useApp();
  const { token } = theme.useToken();
  const [q, setQ] = useState(params.get("q") || "");
  const [geo, setGeo] = useState(params.get("geo") || "US");
  const [auto, setAuto] = useState(false);
  const [state, setState] = useState({ status: "idle" }); // idle | loading | error | topic | compare
  const [alerts, setAlerts] = useState(new Set());
  const [activeTerm, setActiveTerm] = useState(null);
  const current = useRef(state);
  current.current = state;

  // silent = an auto-refresh: keep the reader's place and flag terms new to the top 10
  const search = useCallback(async (query, country, { silent = false } = {}) => {
    query = query.trim();
    if (!query) return;
    if (!silent) {
      history.replaceState(null, "", `?q=${encodeURIComponent(query)}&geo=${country}`);
      setState({ status: "loading", query });
    }
    try {
      const pair = splitCompare(query);
      if (pair.length === 2) {
        const [a, b] = await Promise.all(pair.map((p) => fetchTrends(p, country)));
        return setState({ status: "compare", a, b });
      }
      const next = await fetchTrends(query, country);
      const prev = current.current;
      if (silent && prev.status === "topic" && prev.data.query === next.query) {
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
      new Notification(`New in “${query}” top ${ALERT_TOP}`, { body: terms.join(", ") });
  }

  useEffect(() => { if (q) search(q, geo); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- first load from ?q=

  useEffect(() => {
    const reset = () => { if (!document.hidden) document.title = TITLE; };
    document.addEventListener("visibilitychange", reset);
    return () => document.removeEventListener("visibilitychange", reset);
  }, []);

  // Latest query/country for the timer without restarting it on every keystroke
  const latest = useRef({ q, geo });
  latest.current = { q, geo };
  useEffect(() => {
    if (!auto) return;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    const id = setInterval(() => search(latest.current.q, latest.current.geo, { silent: true }), REFRESH_MS);
    return () => clearInterval(id);
  }, [auto, search]);

  const run = (query = q) => { setQ(query); search(query, geo); };
  const goHome = () => { setQ(""); setState({ status: "idle" }); history.replaceState(null, "", location.pathname); };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Header style={{ paddingInline: 16, background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ maxWidth: 1168, margin: "0 auto" }}>
          <Menu mode="horizontal" selectedKeys={[]} onClick={goHome}
            style={{ fontSize: 16, fontWeight: 600, borderBottom: 0, background: "transparent" }}
            items={[{ key: "home", icon: <RiseOutlined style={{ fontSize: 18 }} />, label: "Trend Radar" }]} />
        </div>
      </Layout.Header>
      <div className="wrap">

        <Flex gap={8} wrap align="center">
          <Input size="large" style={{ flex: "1 1 260px" }} value={q} allowClear
            placeholder="e.g. software, AI, gaming… or compare: AI vs crypto"
            onChange={(e) => setQ(e.target.value)} onPressEnter={() => run()} />
          <Select size="large" value={geo} onChange={setGeo} style={{ width: 170 }} title="Country for Google News and Google Trends"
            options={COUNTRIES.map(([value, label]) => ({ value, label }))} />
          <Button size="large" type="primary" icon={<SearchOutlined />} onClick={() => run()}>Find trends</Button>
          <Tooltip title="Re-check every 10 minutes and flag anything new in the top 10">
            <Flex gap={6} align="center"><Switch size="small" checked={auto} onChange={setAuto} /><Typography.Text type="secondary">Auto-refresh</Typography.Text></Flex>
          </Tooltip>
        </Flex>
        <Flex gap={6} wrap style={{ marginTop: 12 }}>
          {PRESETS.map((p) => <Button key={p} size="small" shape="round" onClick={() => run(p)}>{p}</Button>)}
        </Flex>

        <div style={{ marginTop: 18 }}>
          {state.status === "loading" && (
            <Flex vertical align="center" gap={12} style={{ padding: 48 }}>
              <Spin size="large" />
              <Typography.Text type="secondary">Gathering trends for “{state.query}” from 9 sources…</Typography.Text>
            </Flex>
          )}
          {state.status === "error" && <Alert type="error" showIcon title="Something went wrong" description={state.message} />}
          {state.status === "topic" && (
            <TopicView data={state.data} alerts={alerts} activeTerm={activeTerm} setActiveTerm={setActiveTerm} />
          )}
          {state.status === "compare" && <CompareView a={state.a} b={state.b} />}
        </div>
      </div>
    </Layout>
  );
}
