import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider, theme } from "antd";
import App from "./App.jsx";
import "./styles.css";

const dark = window.matchMedia("(prefers-color-scheme: dark)");

// Follows the OS light/dark setting live; source colours follow it too via styles.css
function Root() {
  const [isDark, setDark] = useState(dark.matches);
  useEffect(() => {
    const on = (e) => setDark(e.matches);
    dark.addEventListener("change", on);
    return () => dark.removeEventListener("change", on);
  }, []);
  return (
    <ConfigProvider theme={{ algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: "#3b5bdb", borderRadius: 10 } }}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><Root /></StrictMode>);
