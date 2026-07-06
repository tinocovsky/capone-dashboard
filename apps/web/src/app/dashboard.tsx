"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Report } from "@capone/shared";
import { supabaseBrowser, authedFetch } from "@/lib/supabase-browser";
import { exportPdf, exportCsv, shareLink } from "@/lib/export";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const PIPELINE_LABEL: Record<string, string> = {
  // Mapeamento real do GHL (location C8d1LN8IL9XdN9kDkaF9)
  pO2K0v6YDMGFF6SIRjfD: "Vendas",
  BeT55Wi2a64zC0YcSKBG: "Pós vendas",
  // Não exibir (fora do dashboard)
  VCgD6NrveofKH6dz8GZJ: "Prospecção (reativação)",
  FGsQB2sid3AEl3OdZYjG: "Barbearia",
};

// Charts são client-only (Recharts usa window/DOM). Carregamento dinâmico para não quebrar SSR.
const ContactsByDayChart = dynamic(
  () => import("@/components/charts/ContactsByDayChart").then((m) => m.ContactsByDayChart),
  { ssr: false, loading: () => <div style={{ height: 140 }} /> },
);
const VendasFunnelChart = dynamic(
  () => import("@/components/charts/VendasFunnelChart").then((m) => m.VendasFunnelChart),
  { ssr: false, loading: () => <div style={{ height: 280 }} /> },
);
const ArtistRevenueChart = dynamic(
  () => import("@/components/charts/ArtistRevenueChart").then((m) => m.ArtistRevenueChart),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);
const OriginPieChart = dynamic(
  () => import("@/components/charts/OriginPieChart").then((m) => m.OriginPieChart),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);
const OriginLegend = dynamic(
  () => import("@/components/charts/OriginPieChart").then((m) => m.OriginLegend),
  { ssr: false },
);
const RevenueAreaChart = dynamic(
  () => import("@/components/charts/RevenueAreaChart").then((m) => m.RevenueAreaChart),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);
const OriginBars = dynamic(
  () => import("@/components/charts/OriginBars").then((m) => m.OriginBars),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);

// Cores das plataformas de ads (CSS vars do tema)
const ADS_PLATFORMS = [
  { key: "facebook", label: "Meta Ads", color: "var(--accent)", note: "Facebook + Instagram" },
  { key: "google",   label: "Google Ads", color: "var(--yellow)", note: "Search + Display" },
  { key: "tiktok",   label: "TikTok Ads", color: "var(--accent-2)", note: "" },
  { key: "organico", label: "Orgânico", color: "var(--green)", note: "Sem rastreamento de ads" },
  { key: "outros",   label: "Outros", color: "var(--muted)", note: "utm de origens não-ads" },
] as const;

function rateClass(rate: number) {
  if (rate >= 0.6) return "green";
  if (rate >= 0.3) return "yellow";
  return "red";
}

function ReportTable({ rows }: { rows: { label: string; count: number; percent: number }[] }) {
  if (!rows.length) return <div className="note">Sem dados no período.</div>;
  return (
    <table>
      <thead>
        <tr><th>Categoria</th><th className="num">Contatos</th><th className="num">% do mês</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}><td>{r.label}</td><td className="num">{r.count}</td><td className="num">{r.percent.toFixed(1)}%</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function PerformanceTable({ rows }: { rows: { label: string; total: number; convertidos: number; naoConvertidos: number; taxaConversao: number; ticketMedio: number; receitaConvertida: number }[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Categoria</th><th className="num">Total</th><th className="num">Convertidos</th>
          <th className="num">Não convertidos</th><th className="num">Conversão</th>
          <th className="num">Ticket convertido</th><th className="num">Receita convertida</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td><strong>{r.label}</strong></td>
            <td className="num">{r.total}</td>
            <td className="num">{r.convertidos}</td>
            <td className="num">{r.naoConvertidos}</td>
            <td className={`num ${rateClass(r.taxaConversao)}`}>{fmtPct(r.taxaConversao)}</td>
            <td className="num">{fmtBRL(r.ticketMedio)}</td>
            <td className="num">{fmtBRL(r.receitaConvertida)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Dashboard({ user }: { user: { id: string; email: string } }) {
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [start, setStart] = useState(first.toISOString().slice(0, 10));
  const [end, setEnd] = useState(last.toISOString().slice(0, 10));

  async function load(opts: { force?: boolean } = {}) {
    setLoading(true); setErr(null);
    const { data: sess } = await supabaseBrowser().auth.getSession();
    const r = await authedFetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/reports?start=${start}&end=${end}${opts.force ? "&forceRefresh=1" : ""}`,
      {},
      sess.session,
    );
    if (!r.ok) {
      setErr(`API ${r.status}: ${await r.text()}`);
      setLoading(false);
      return;
    }
    setReport(await r.json());
    setLoading(false);
  }

  async function snapshot() {
    const { data: sess } = await supabaseBrowser().auth.getSession();
    const r = await authedFetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/reports/snapshot`,
      { method: "POST", body: JSON.stringify({ start, end }) },
      sess.session,
    );
    if (r.ok) {
      const { id } = await r.json();
      setErr(`OK Snapshot salvo (${id.slice(0, 8)}...)`);
    } else setErr(`Falha: ${r.status} ${await r.text()}`);
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    location.href = "/login";
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="wrap" id="dashboard-root">
      <h1>Dashboard GHL — {start.slice(0, 4)}/{start.slice(5, 7)}</h1>
      <div className="sub">Capone Club • {user.email}</div>

      <div className="toolbar no-export" style={{ marginTop: 12 }}>
        <label className="sub">Início <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ marginLeft: 4, padding: 4, background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6 }} /></label>
        <label className="sub">Fim <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={{ marginLeft: 4, padding: 4, background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6 }} /></label>
        <button className="pill-btn" onClick={() => load()} disabled={loading}>{loading ? "Carregando..." : "Atualizar"}</button>
        <button className="pill-btn" onClick={() => load({ force: true })} disabled={loading}>Forçar refresh</button>
        <button className="pill-btn" onClick={snapshot} disabled={!report}>Salvar snapshot</button>
        <button className="pill-btn" onClick={() => report && exportCsv(report)} disabled={!report}>Exportar CSV</button>
        <button
          className="pill-btn"
          onClick={async () => {
            if (!report) return;
            const btn = document.getElementById("btn-export-pdf") as HTMLButtonElement | null;
            if (btn) { btn.disabled = true; btn.textContent = "Gerando PDF..."; }
            try { await exportPdf("dashboard-root", report); }
            catch (e) { setErr(`Erro ao gerar PDF: ${e instanceof Error ? e.message : String(e)}`); }
            finally { if (btn) { btn.disabled = false; btn.textContent = "Exportar PDF"; } }
          }}
          disabled={!report}
          id="btn-export-pdf"
        >
          Exportar PDF
        </button>
        <button
          className="pill-btn"
          onClick={async () => {
            await shareLink({ start, end });
            setErr("Link do período copiado pro clipboard.");
          }}
        >
          Compartilhar link
        </button>
        <button className="pill-btn" onClick={logout} style={{ marginLeft: "auto" }}>Sair</button>
      </div>

      {err && <div className="note" style={{ marginTop: 8 }}>{err}</div>}

      {report && (
        <>
          {/* ========================================================================
              HERO — destaque em 1 tela com as 5 métricas-chave + funil + origem
              ========================================================================= */}
          <h2 style={{ marginTop: 8 }}>Visão Geral</h2>
          <div className="hero">
            {/* Lado esquerdo: 5 KPIs em destaque + barras de origem */}
            <div className="hero-side" style={{ gap: 16 }}>
              <div className="hero-kpis">
                {/* 1. Total Vendido — HERO (ocupa 2 colunas) */}
                <div className="hero-kpi primary green">
                  <div className="accent-bar" />
                  <div className="label">Total Vendido</div>
                  <div className="val green">{fmtBRL(report.totals.receitaConvertida)}</div>
                  <div className="sub">
                    {report.totals.convertidas} convertidas • ticket médio {fmtBRL(report.totals.ticketMedio)}
                  </div>
                </div>
                {/* 2. Taxa de Conversão */}
                <div className={`hero-kpi ${rateClass(report.totals.taxaConversao)}`}>
                  <div className="accent-bar" />
                  <div className="label">Taxa de Conversão</div>
                  <div className={`val ${rateClass(report.totals.taxaConversao)}`}>
                    {fmtPct(report.totals.taxaConversao)}
                  </div>
                  <div className="sub">
                    {report.totals.convertidas} conv / {report.totals.convertidas + report.totals.naoConvertidas} decididos
                  </div>
                </div>
                {/* 3. Novos Contatos */}
                <div className="hero-kpi purple">
                  <div className="accent-bar" />
                  <div className="label">Novos Contatos</div>
                  <div className="val">{report.totals.novosContatos.toLocaleString("pt-BR")}</div>
                  <div className="sub">{report.totals.oportunidades} viraram oportunidade</div>
                </div>
                {/* 4. Visitas por Origem (soma total) */}
                {report.visitsByOrigin && (
                  <div className="hero-kpi">
                    <div className="accent-bar" />
                    <div className="label">Visitas (oportunidades)</div>
                    <div className="val">
                      {Object.values(report.visitsByOrigin).reduce((s, b) => s + b.visitas, 0).toLocaleString("pt-BR")}
                    </div>
                    <div className="sub">no período</div>
                  </div>
                )}
                {/* 5. Cycle time (mediana) */}
                <div className="hero-kpi">
                  <div className="accent-bar" />
                  <div className="label">Cycle time</div>
                  <div className="val">{report.totals.cycleTimeMedianaDias.toFixed(1)}d</div>
                  <div className="sub">mediana de fechamento</div>
                </div>
              </div>
            </div>

            {/* Lado direito: funil compacto (mesmo funil da seção 4, mas
                num card dedicado do hero) */}
            <div>
              {report.vendasFunnel && <VendasFunnelChart stages={report.vendasFunnel} />}
            </div>
          </div>

          {/* Barras de origem (logo abaixo do hero) */}
          <div style={{ marginTop: 16 }}>
            <div className="note" style={{ borderLeftColor: "var(--accent-2)" }}>
              <strong>Visitas por Origem</strong> — segregação por macro-origem do briefing (Artistas, Social Pago, Social Orgânico, Passante). A barra é proporcional ao total de visitas; o badge verde/amarelo/vermelho mostra a taxa de conversão.
            </div>
            <OriginBars data={report.visitsByOrigin} />
          </div>

          {/* ========================================================================
              SEÇÃO: Métricas de Ads (Meta / Google / TikTok)
              ========================================================================= */}
          {report.adsMetrics && (
            <>
              <h2>Métricas de Ads</h2>
              <div className="note">
                Origem dos leads por plataforma — classificados via <code>fbclid</code> (Meta), <code>gclid_id</code> (Google) e <code>utm_source</code> gravados no GHL. <strong>Custo/ROAS/CPA</strong> não estão disponíveis — o GHL não armazena investimento. Para preencher, suba CSVs mensais das plataformas ou integre Meta/Google Ads API.
              </div>
              <div className="ads-grid">
                {ADS_PLATFORMS.map((p) => {
                  const m = report.adsMetrics?.[p.key as keyof typeof report.adsMetrics];
                  if (!m) return null;
                  const isEmpty = m.visitas === 0 && m.oportunidades === 0;
                  return (
                    <div key={p.key} className={`ads-card ${isEmpty ? "empty" : ""}`}>
                      <div className="platform">
                        <span className="dot" style={{ background: p.color }} />
                        {p.label}
                      </div>
                      <div className="stat-row"><span>Visitas</span><span className="v">{m.visitas.toLocaleString("pt-BR")}</span></div>
                      <div className="stat-row"><span>Oportunidades</span><span className="v">{m.oportunidades.toLocaleString("pt-BR")}</span></div>
                      <div className="stat-row"><span>Convertidas</span><span className="v">{m.convertidas.toLocaleString("pt-BR")}</span></div>
                      <div className="stat-row"><span>Receita</span><span className="v" style={{ color: m.receita > 0 ? "var(--green)" : "var(--muted)" }}>{fmtBRL(m.receita)}</span></div>
                      {m.custo == null && (
                        <div className="no-cost">Custo / ROAS / CPA: não disponível no GHL</div>
                      )}
                      {m.custo != null && (
                        <>
                          <div className="stat-row"><span>Custo</span><span className="v">{fmtBRL(m.custo)}</span></div>
                          <div className="stat-row"><span>ROAS</span><span className="v">{m.roas?.toFixed(2) ?? "—"}x</span></div>
                          <div className="stat-row"><span>CPA</span><span className="v">{m.cpa ? fmtBRL(m.cpa) : "—"}</span></div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ========================================================================
              Seções 1-9 originais (mantidas)
              ========================================================================= */}
          <h2>1. Performance Detalhada (visão antiga)</h2>
          <div className="grid cards">
            <div className="card"><div className="label">Novos contatos</div><div className="val">{report.totals.novosContatos.toLocaleString("pt-BR")}</div><div className="sub">{report.totals.oportunidades} viraram oportunidade</div></div>
            <div className="card"><div className="label">Oportunidades</div><div className="val">{report.totals.oportunidades}</div><div className="sub">{report.totals.convertidas} convertidas • {report.totals.naoConvertidas} não convertidas</div></div>
            <div className="card"><div className="label">Taxa de conversão</div><div className={`val ${rateClass(report.totals.taxaConversao)}`}>{fmtPct(report.totals.taxaConversao)}</div><div className="sub">convertidos / decididos</div></div>
            <div className="card"><div className="label">Receita convertida</div><div className="val green">{fmtBRL(report.totals.receitaConvertida)}</div><div className="sub">ticket médio {fmtBRL(report.totals.ticketMedio)}</div></div>
          </div>
          <div className="grid cards-3" style={{ marginTop: 16 }}>
            <div className="card"><div className="label">Cycle time (convertidos)</div><div className="val">{report.totals.cycleTimeMedianaDias.toFixed(1)}d</div><div className="sub">mediana</div></div>
            <div className="card"><div className="label">Artistas no mês</div><div className="val">{report.totals.artistasNoMes}</div><div className="sub">com pelo menos 1 lead decidido</div></div>
            <div className="card"><div className="label">Closers no mês</div><div className="val">{report.totals.closersNoMes}</div></div>
          </div>

          <h2>2. Novos Contatos</h2>
          <h3>2.1 Novos contatos por dia</h3>
          <ContactsByDayChart rows={report.contactsByDay} total={report.totals.novosContatos} />
          <ReportTable rows={report.contactsByDay} />

          <h3>2.2 Por origem (sessão) — top 6 visualizado em pizza</h3>
          <div className="row-2">
            <OriginPieChart rows={report.contactsBySourceSession} />
            <div style={{ alignSelf: "center" }}>
              <OriginLegend rows={report.contactsBySourceSession} />
            </div>
          </div>
          <h3>2.3 Por canal (meio)</h3>
          <ReportTable rows={report.contactsByChannel} />
          <h3>2.4 Cruzamento Sessão × Meio (top 10)</h3>
          <ReportTable rows={report.sessionXChannel} />
          <h3>2.5 Landing pages (top 10)</h3>
          <table>
            <thead><tr><th>Landing Page</th><th className="num">Visitas (contatos)</th></tr></thead>
            <tbody>{report.topLandingPages.map((r) => <tr key={r.label}><td className="url-cell">{r.label}</td><td className="num">{r.count}</td></tr>)}</tbody>
          </table>
          <h3>2.6 Ad IDs (top 10)</h3>
          <table>
            <thead><tr><th>Ad ID</th><th className="num">Contatos</th></tr></thead>
            <tbody>{report.topAdIds.map((r) => <tr key={r.label}><td className="url-cell">{r.label}</td><td className="num">{r.count}</td></tr>)}</tbody>
          </table>
          <h3>2.7 Source legado (top 10)</h3>
          <ReportTable rows={report.topLegacySources} />
          <h3>2.8 Tags principais</h3>
          <ReportTable rows={report.topTags} />

          <h2>3. Performance por Pipeline</h2>
          <table>
            <thead>
              <tr><th>Pipeline</th><th className="num">Total</th><th className="num">Convertidos</th>
                <th className="num">Não convertidos</th><th className="num">Conversão</th><th className="num">Receita convertida</th></tr>
            </thead>
            <tbody>
              {report.pipelineBreakdown.map((p) => (
                <tr key={p.pipeline}>
                  <td><strong>{PIPELINE_LABEL[p.pipeline] ?? p.pipeline}</strong></td>
                  <td className="num">{p.total}</td><td className="num">{p.convertidos}</td>
                  <td className="num">{p.naoConvertidos}</td>
                  <td className={`num ${rateClass(p.taxaConversao)}`}>{fmtPct(p.taxaConversao)}</td>
                  <td className="num">{fmtBRL(p.receitaConvertida)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>4. Funil de Vendas (junho)</h2>
          <div className="note">Cada barra mostra quantas oportunidades estão em cada estágio. Cor: <span style={{ color: "var(--green)" }}>verde</span> = 90%+ de conversão, <span style={{ color: "var(--yellow)" }}>amarelo</span> = 50-90%, <span style={{ color: "var(--red)" }}>vermelho</span> = menos de 50%.</div>
          {report.vendasFunnel && <VendasFunnelChart stages={report.vendasFunnel} />}

          <h2>5. Receita acumulada do mês</h2>
          <div className="note">Curva de receita convertida acumulada dia a dia — mostra o ritmo de fechamento do mês.</div>
          {report.revenueByDay && <RevenueAreaChart rows={report.revenueByDay} />}

          <h2>6. Performance por Artista (top 12 por receita)</h2>
          {report.byArtist.length > 0 && <ArtistRevenueChart rows={report.byArtist} />}
          <PerformanceTable rows={report.byArtist} />

          <h2>6. Performance por Closer</h2>
          <PerformanceTable rows={report.byCloser} />

          <h2>7. Performance por Origem (macro)</h2>
          <PerformanceTable rows={report.byOrigin} />

          <h2>8. Alertas e Observações</h2>
          <div className="callout">
            <ul className="tight">
              {report.alerts.map((a, i) => (
                <li key={i}><strong>{a.title}:</strong> {a.message}</li>
              ))}
              {report.alerts.length === 0 && <li>Sem alertas críticos no período.</li>}
            </ul>
          </div>

          <div className="footer">
            {report.cacheHit ? `Cache (${report.cacheAgeSeconds}s atras)` : "Recem-calculado"} • {report.totals.novosContatos} contatos • {report.totals.oportunidades} opps • {report.totals.convertidas} convertidas • {fmtBRL(report.totals.receitaConvertida)} receita
          </div>
        </>
      )}
    </div>
  );
}
