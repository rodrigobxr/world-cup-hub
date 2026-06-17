import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rodrigão — Copa do Mundo 2026" },
      { name: "description", content: "Acompanhe a Copa do Mundo FIFA 2026 com Rodrigão: jogos de hoje, grupos, mata-mata, artilharia e notícias." },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/rodrigao.html");
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#0C0C0C", color: "#F5C842", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      Carregando Rodrigão — Copa 2026...
    </div>
  );
}
