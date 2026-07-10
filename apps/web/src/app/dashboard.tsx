"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ArtistBySource, ContactsByDaySource, Report } from "@capone/shared";
import { supabaseBrowser, authedFetch } from "@/lib/supabase-browser";
import { exportPdf, exportCsv, shareLink } from "@/lib/export";
import { fmtBRL, fmtPct, fmtCycle, fmtPeriod, fmtDateBR } from "@/lib/format";
import { SnapshotsPanel, type SnapshotMeta } from "@/components/SnapshotsPanel";

// Charts são client-only (Recharts usa window/DOM). Carregamento dinâmico para não quebrar SSR.
const ContactsByDayChart = dynamic(
  () => import("@/components/charts/ContactsByDayChart").then((m) => m.ContactsByDayChart),
  { ssr: false, loading: () => <div style={{ height: 140 }} /> },
);
const ContactsByOriginCard = dynamic(
  () => import("@/components/charts/ContactsByOriginCard").then((m) => m.ContactsByOriginCard),
  { ssr: false, loading: () => <div style={{ height: 280 }} /> },
);
const ArtistPerformanceChart = dynamic(
  () => import("@/components/charts/ArtistRevenueChart").then((m) => m.ArtistPerformanceChart),
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
const OriginBars = dynamic(
  () => import("@/components/charts/OriginBars").then((m) => m.OriginBars),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);
const ArtistSourceChart = dynamic(
  () => import("@/components/charts/ArtistSourceChart").then((m) => m.ArtistSourceChart),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);
const AppointmentsPieChart = dynamic(
  () => import("@/components/charts/AppointmentsPieChart").then((m) => m.AppointmentsPieChart),
  { ssr: false, loading: () => <div style={{ height: 120 }} /> },
);

// Cores das plataformas de ads (CSS vars do tema)
const ADS_PLATFORMS = [
  { key: "facebook", label: "Meta Ads", color: "var(--accent)", note: "Facebook + Instagram" },
  { key: "google",   label: "Google Ads", color: "var(--yellow)", note: "Search + Display" },
  { key: "tiktok",   label: "TikTok Ads", color: "var(--accent-2)", note: "" },
  { key: "organico", label: "Orgânico", color: "var(--green)", note: "Sem rastreamento de ads" },
  { key: "outros",   label: "Outros", color: "var(--muted)", note: "utm de origens não-ads" },
] as const;

const ALERT_PILL: Record<string, { cls: string; label: string }> = {
  info: { cls: "pill-ok", label: "info" },
  warn: { cls: "pill-warn", label: "atenção" },
  bad: { cls: "pill-bad", label: "crítico" },
};

function rateClass(rate: number) {
  if (rate >= 0.6) return "green";
  if (rate >= 0.3) return "yellow";
  return "red";
}

/** Data local em YYYY-MM-DD (sem o desvio de fuso do toISOString). */
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Cache/snapshots antigos podem ter o shape pré-SDR (byCloser/closersNoMes). */
function normalizeReport(raw: Report): Report {
  const legacy = raw as Report & { byCloser?: Report["bySdr"] };
  const totals = raw.totals as Report["totals"] & { closersNoMes?: number };
  return {
    ...raw,
    bySdr: raw.bySdr ?? legacy.byCloser ?? [],
    totals: { ...totals, sdrsNoMes: totals.sdrsNoMes ?? totals.closersNoMes ?? 0 },
  };
}

function ReportTable({ rows, labelHeader = "Categoria" }: { rows: { label: string; count: number; percent: number }[]; labelHeader?: string }) {
  if (!rows.length) return <div className="note">Sem dados no período.</div>;
  return (
    <table>
      <thead>
        <tr><th>{labelHeader}</th><th className="num">Contatos</th><th className="num">% do período</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}><td>{r.label}</td><td className="num">{r.count}</td><td className="num">{r.percent.toFixed(1)}%</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tabela de contatos por dia: uma coluna por origem (sessionSource), total e % do período. */
function DaySourceTable({ data, totalContacts }: { data: ContactsByDaySource; totalContacts: number }) {
  if (!data.rows.length) return <div className="note">Sem dados no período.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Data</th>
          {data.sources.map((s) => <th key={s} className="num">{s}</th>)}
          <th className="num">Total</th>
          <th className="num">% do período</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => (
          <tr key={r.date}>
            <td>{fmtDateBR(r.date)}</td>
            {data.sources.map((s) => (
              <td key={s} className="num" style={{ color: (r.bySource[s] ?? 0) === 0 ? "var(--muted)" : undefined }}>
                {r.bySource[s] ?? 0}
              </td>
            ))}
            <td className="num"><strong>{r.total}</strong></td>
            <td className="num">{totalContacts ? ((r.total / totalContacts) * 100).toFixed(1) : "0.0"}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tabela cruzada artista × origem: 4 colunas (total/conv/não conv/%) por origem. */
function ArtistSourceTable({ data }: { data: ArtistBySource }) {
  if (!data.rows.length) return <div className="note">Sem dados no período.</div>;
  const empty = { total: 0, convertidos: 0, naoConvertidos: 0, taxaConversao: 0 };
  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr>
            <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Artista</th>
            {data.sources.map((s) => (
              <th key={s} colSpan={4} className="num" style={{ borderLeft: "1px solid var(--line)", textAlign: "center" }}>{s}</th>
            ))}
          </tr>
          <tr>
            {data.sources.map((s) => (
              <React.Fragment key={s}>
                <th className="num" style={{ borderLeft: "1px solid var(--line)" }}>Total</th>
                <th className="num">Conv</th>
                <th className="num">Não conv</th>
                <th className="num">% conv</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.artist}>
              <td><strong>{r.artist}</strong></td>
              {data.sources.map((s) => {
                const c = r.bySource[s] ?? empty;
                const mute = c.total === 0;
                return (
                  <React.Fragment key={s}>
                    <td className="num" style={{ borderLeft: "1px solid var(--line)", color: mute ? "var(--muted)" : undefined }}>{c.total}</td>
                    <td className="num" style={{ color: mute ? "var(--muted)" : "var(--green)" }}>{c.convertidos}</td>
                    <td className="num" style={{ color: mute ? "var(--muted)" : "var(--red)" }}>{c.naoConvertidos}</td>
                    <td className={`num ${mute ? "" : rateClass(c.taxaConversao)}`} style={{ color: mute ? "var(--muted)" : undefined }}>
                      {mute ? "—" : fmtPct(c.taxaConversao)}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerformanceTable({ rows }: { rows: { label: string; total: number; convertidos: number; naoConvertidos: number; taxaConversao: number; ticketMedio: number; receitaConvertida: number }[] }) {
  if (!rows.length) return <div className="note">Sem dados no período.</div>;
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

export default function Dashboard({
  user,
  initialStart,
  initialEnd,
}: {
  user: { id: string; email: string };
  initialStart?: string;
  initialEnd?: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshotsVersion, setSnapshotsVersion] = useState(0);
  const [viewingSnapshot, setViewingSnapshot] = useState<SnapshotMeta | null>(null);

  const today = new Date();
  const [start, setStart] = useState(
    initialStart ?? localISO(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [end, setEnd] = useState(
    initialEnd ?? localISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  );

  // Mensagens de sucesso somem sozinhas
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const load = useCallback(
    async (opts: { force?: boolean } = {}) => {
      setLoading(true);
      setErr(null);
      try {
        const { data: sess } = await supabaseBrowser().auth.getSession();
        const r = await authedFetch(
          `${process.env.NEXT_PUBLIC_API_BASE}/api/reports?start=${start}&end=${end}${opts.force ? "&forceRefresh=1" : ""}`,
          {},
          sess.session,
        );
        if (!r.ok) {
          setErr(`API ${r.status}: ${await r.text()}`);
          return;
        }
        setReport(normalizeReport(await r.json()));
      } catch (e) {
        setErr(`Falha de rede: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    },
    [start, end],
  );

  // Período invertido é derivado no render (aviso) e bloqueia o auto-reload.
  const periodInvalid = start > end;

  // Carrega no mount imediatamente; mudanças de período recarregam com debounce.
  const firstRun = useRef(true);
  useEffect(() => {
    if (viewingSnapshot || periodInvalid) return; // snapshot congelado / datas invertidas
    if (firstRun.current) {
      firstRun.current = false;
      void load();
      return;
    }
    const t = setTimeout(() => void load(), 600);
    return () => clearTimeout(t);
  }, [load, viewingSnapshot, periodInvalid]);

  function setPeriod(s: Date, e: Date) {
    setStart(localISO(s));
    setEnd(localISO(e));
  }
  const presets = [
    {
      label: "Este mês",
      apply: () => setPeriod(new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    },
    {
      label: "Mês passado",
      apply: () => setPeriod(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    {
      label: "Últimos 30 dias",
      apply: () => setPeriod(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), today),
    },
  ];

  async function snapshot() {
    const { data: sess } = await supabaseBrowser().auth.getSession();
    const r = await authedFetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/reports/snapshot`,
      { method: "POST", body: JSON.stringify({ start, end }) },
      sess.session,
    );
    if (r.ok) {
      const { id } = await r.json();
      setMsg(`Snapshot salvo (${id.slice(0, 8)}…)`);
      setSnapshotsVersion((v) => v + 1); // painel aberto recarrega a lista
    } else setErr(`Falha ao salvar snapshot: ${r.status} ${await r.text()}`);
  }

  async function openSnapshot(s: SnapshotMeta) {
    setLoading(true);
    setErr(null);
    try {
      const { data: sess } = await supabaseBrowser().auth.getSession();
      const r = await authedFetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/reports/snapshot/${s.id}`,
        {},
        sess.session,
      );
      if (!r.ok) {
        setErr(`Falha ao abrir snapshot: ${r.status}`);
        return;
      }
      const { snapshot } = await r.json();
      setReport(normalizeReport(snapshot.report));
      setStart(snapshot.period_start);
      setEnd(snapshot.period_end);
      setViewingSnapshot(s);
      setShowSnapshots(false);
    } finally {
      setLoading(false);
    }
  }

  function backToLive() {
    setViewingSnapshot(null); // effect recarrega o período atual
  }

  async function exportPdfClick() {
    if (!report || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportPdf("dashboard-root", report);
    } catch (e) {
      setErr(`Erro ao gerar PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportingPdf(false);
    }
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    location.href = "/login";
  }

  const frozen = viewingSnapshot !== null;

  return (
    <div className="wrap" id="dashboard-root">
      <h1>Dashboard GHL — {fmtPeriod(start, end)}</h1>
      <div className="sub">Capone Club • {user.email}</div>

      <div className="toolbar no-export" style={{ marginTop: 12 }}>
        <label className="sub" htmlFor="dt-start">Início <input id="dt-start" type="date" value={start} disabled={frozen} onChange={(e) => setStart(e.target.value)} style={{ marginLeft: 4, padding: 4, background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6 }} /></label>
        <label className="sub" htmlFor="dt-end">Fim <input id="dt-end" type="date" value={end} disabled={frozen} onChange={(e) => setEnd(e.target.value)} style={{ marginLeft: 4, padding: 4, background: "var(--panel)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6 }} /></label>
        {presets.map((p) => (
          <button key={p.label} className="pill-btn" onClick={p.apply} disabled={loading || frozen}>{p.label}</button>
        ))}
        <button className="pill-btn" onClick={() => load()} disabled={loading || frozen}>{loading ? "Carregando…" : "Atualizar"}</button>
        <button className="pill-btn" onClick={() => load({ force: true })} disabled={loading || frozen}>Forçar refresh</button>
        <button className="pill-btn" onClick={snapshot} disabled={!report || frozen}>Salvar snapshot</button>
        <button className="pill-btn" onClick={() => setShowSnapshots((v) => !v)}>
          {showSnapshots ? "Fechar snapshots" : "Snapshots"}
        </button>
        <button className="pill-btn" onClick={() => report && exportCsv(report)} disabled={!report}>Exportar CSV</button>
        <button className="pill-btn" onClick={exportPdfClick} disabled={!report || exportingPdf}>
          {exportingPdf ? "Gerando PDF…" : "Exportar PDF"}
        </button>
        <button
          className="pill-btn"
          onClick={async () => {
            await shareLink({ start, end });
            setMsg("Link do período copiado para o clipboard.");
          }}
        >
          Compartilhar link
        </button>
        <button className="pill-btn" onClick={logout} style={{ marginLeft: "auto" }}>Sair</button>
      </div>

      {frozen && viewingSnapshot && (
        <div className="note no-export" style={{ marginTop: 8, borderLeftColor: "var(--yellow)" }}>
          <strong>Visualizando snapshot</strong> salvo em {new Date(viewingSnapshot.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ({fmtPeriod(viewingSnapshot.period_start, viewingSnapshot.period_end)}).{" "}
          <button className="pill-btn" onClick={backToLive} style={{ marginLeft: 8 }}>Voltar ao ao vivo</button>
        </div>
      )}

      {showSnapshots && (
        <div className="no-export">
          <SnapshotsPanel key={snapshotsVersion} onSelect={openSnapshot} onError={setErr} />
        </div>
      )}

      {periodInvalid && (
        <div className="note no-export" style={{ marginTop: 8, borderLeftColor: "var(--yellow)", color: "var(--yellow)" }}>
          Período inválido: a data inicial é posterior à final.
        </div>
      )}
      {err && <div className="note no-export" style={{ marginTop: 8, borderLeftColor: "var(--red)", color: "var(--red)" }}>{err}</div>}
      {msg && <div className="note no-export" style={{ marginTop: 8, borderLeftColor: "var(--green)", color: "var(--green)" }}>{msg}</div>}
      {loading && !report && <div className="note" style={{ marginTop: 8 }}>Carregando relatório…</div>}

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
                  <div className="val">{fmtCycle(report.totals.cycleTimeMedianaDias)}</div>
                  <div className="sub">mediana de fechamento</div>
                </div>
                {/* 6. Agendamentos — status + origem (calendários GHL) */}
                {report.appointments && (
                  <div className="hero-kpi wide">
                    <div className="accent-bar" style={{ background: "var(--accent-2)" }} />
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                      <div className="label">Agendamentos</div>
                      <div className="val" style={{ fontSize: 24, marginTop: 0 }}>{report.appointments.total}</div>
                      <div className="sub" style={{ marginTop: 0 }}>no período</div>
                    </div>
                    <AppointmentsPieChart data={report.appointments} />
                  </div>
                )}
              </div>
            </div>

            {/* Lado direito: contatos por origem no período — prioridade no hero
                (substitui o funil de vendas, removido daqui). */}
            <div className="hero-kpi" style={{ height: "100%" }}>
              <div className="accent-bar" style={{ background: "var(--accent-2)" }} />
              <div className="label">Contatos por Origem</div>
              <div className="sub" style={{ marginBottom: 12 }}>{report.totals.novosContatos.toLocaleString("pt-BR")} no período</div>
              {report.contactsByDaySource ? (
                <ContactsByOriginCard data={report.contactsByDaySource} total={report.totals.novosContatos} />
              ) : (
                <div className="note">Disponível após recalcular o relatório (clique em &quot;Forçar refresh&quot;).</div>
              )}
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
              Seções numeradas
              ========================================================================= */}
          <h2>1. Performance por Origem (macro)</h2>
          <PerformanceTable rows={report.byOrigin} />

          <h2>2. Performance por Artista</h2>
          <div className="note">Todos os artistas ativos no período (ao menos 1 lead decidido), ordenados por total vendido. Dois painéis com as mesmas linhas: à esquerda o <span style={{ color: "var(--cyan)" }}>total vendido</span> (escala R$); à direita os leads decididos (<span style={{ color: "var(--green)" }}>convertidos</span> + <span style={{ color: "var(--red)" }}>não convertidos</span> empilhados), com o % de conversão na ponta.</div>
          {report.byArtist.length > 0 && <ArtistPerformanceChart rows={report.byArtist} />}
          <PerformanceTable rows={report.byArtist} />

          <h3>2.1 Artista × grupo de clientes</h3>
          <div className="note">
            <strong>Clientes Capone</strong> = leads com session source válido (Paid Social, Social media, etc.) ou com &quot;Fonte do negócio&quot; ≠ Artistas.{" "}
            <strong>Clientes dos Artistas</strong> = leads sem source (ou CRM UI) cuja oportunidade tem &quot;Fonte do negócio&quot; = Artistas.
            {(report.byArtistSource?.naoClassificados ?? 0) > 0 && (
              <> {report.byArtistSource!.naoClassificados} lead(s) sem source e sem fonte caíram no default (Capone).</>
            )}
          </div>
          {report.byArtistSource ? (
            <>
              <ArtistSourceTable data={report.byArtistSource} />
              <div className="note" style={{ marginTop: 12 }}>Mix por artista — cada segmento é o total de leads do grupo.</div>
              <ArtistSourceChart data={report.byArtistSource} />
            </>
          ) : (
            <div className="note">Disponível após recalcular o relatório (clique em &quot;Forçar refresh&quot;).</div>
          )}

          <h2>3. Novos Contatos</h2>
          <h3>3.1 Novos contatos por dia — segregado por origem da sessão</h3>
          {report.contactsByDaySource ? (
            <>
              <ContactsByDayChart data={report.contactsByDaySource} />
              <DaySourceTable data={report.contactsByDaySource} totalContacts={report.totals.novosContatos} />
            </>
          ) : (
            // snapshots antigos não têm a segregação por origem
            <ReportTable labelHeader="Data" rows={report.contactsByDay.map((r) => ({ ...r, label: fmtDateBR(r.label) }))} />
          )}

          <h3>3.2 Por origem (sessão) — top 6 visualizado em pizza</h3>
          <div className="row-2">
            <OriginPieChart rows={report.contactsBySourceSession} />
            <div style={{ alignSelf: "center" }}>
              <OriginLegend rows={report.contactsBySourceSession} />
            </div>
          </div>
          <h3>3.3 Por canal (meio)</h3>
          <ReportTable rows={report.contactsByChannel} />
          <h3>3.4 Cruzamento Sessão × Meio (top 10)</h3>
          <ReportTable rows={report.sessionXChannel} />
          <h3>3.5 Landing pages (top 10)</h3>
          <table>
            <thead><tr><th>Landing Page</th><th className="num">Visitas (contatos)</th></tr></thead>
            <tbody>{report.topLandingPages.map((r) => <tr key={r.label}><td className="url-cell">{r.label}</td><td className="num">{r.count}</td></tr>)}</tbody>
          </table>
          <h3>3.6 Ad IDs (top 10)</h3>
          <table>
            <thead><tr><th>Ad ID</th><th className="num">Contatos</th></tr></thead>
            <tbody>{report.topAdIds.map((r) => <tr key={r.label}><td className="url-cell">{r.label}</td><td className="num">{r.count}</td></tr>)}</tbody>
          </table>
          <h3>3.7 Source legado (top 10)</h3>
          <ReportTable rows={report.topLegacySources} />

          <h2>4. Performance por SDR</h2>
          <div className="note">SDR = campo <strong>&quot;Dono do negócio&quot;</strong> da oportunidade no GHL.</div>
          <PerformanceTable rows={report.bySdr} />

          <h2>5. Alertas e Observações</h2>
          <div className="callout">
            <ul className="tight">
              {report.alerts.map((a, i) => {
                const pill = ALERT_PILL[a.severity] ?? ALERT_PILL.info;
                return (
                  <li key={i}>
                    <span className={`pill ${pill.cls}`} style={{ marginRight: 8 }}>{pill.label}</span>
                    <strong>{a.title}:</strong> {a.message}
                  </li>
                );
              })}
              {report.alerts.length === 0 && <li>Sem alertas críticos no período.</li>}
            </ul>
          </div>

          <div className="footer">
            {report.cacheHit ? `Cache (${report.cacheAgeSeconds}s atrás)` : "Recém-calculado"} • {report.totals.novosContatos} contatos • {report.totals.oportunidades} opps • {report.totals.convertidas} convertidas • {fmtBRL(report.totals.receitaConvertida)} receita
          </div>
        </>
      )}
    </div>
  );
}
