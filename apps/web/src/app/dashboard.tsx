"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ArtistBySource, ContactsByDaySource, Report } from "@capone/shared";
import { supabaseBrowser, authedFetch } from "@/lib/supabase-browser";
import { exportPdf, exportCsv, shareLink } from "@/lib/export";
import { fmtBRL, fmtBRLPrecise, fmtPct, fmtPeriod, fmtDateBR } from "@/lib/format";
import { SnapshotsPanel, type SnapshotMeta } from "@/components/SnapshotsPanel";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";

// Charts são client-only (Recharts usa window/DOM). Carregamento dinâmico para não quebrar SSR.
const ContactsByDayChart = dynamic(
  () => import("@/components/charts/ContactsByDayChart").then((m) => m.ContactsByDayChart),
  { ssr: false, loading: () => <div style={{ height: 140 }} /> },
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
const FunnelByOrigin = dynamic(
  () => import("@/components/charts/FunnelByOrigin").then((m) => m.FunnelByOrigin),
  { ssr: false, loading: () => <div style={{ height: 200 }} /> },
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
        <DateRangePicker
          value={{ start, end }}
          onChange={({ start: s, end: e }: DateRange) => {
            setStart(s);
            setEnd(e);
          }}
          disabled={frozen}
        />
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
              HERO — destaque em 1 tela com os 4 KPIs-chave + Agendamentos (full-width)
              ========================================================================= */}
          <h2 style={{ marginTop: 8 }}>Visão Geral</h2>
          <div className="hero-kpis" style={{ marginTop: 4 }}>
            {/* 1. Total Vendido — HERO (ocupa 2 colunas) */}
            <div className="hero-kpi primary green">
              <div className="accent-bar" />
              <div className="label">Total Vendido</div>
              <div className="val green">{fmtBRL(report.totals.receitaConvertida)}</div>
              <div className="sub">
                {report.totals.convertidas} convertidas • ticket médio {fmtBRL(report.totals.ticketMedio)}
              </div>
            </div>
            {/* 2. Ticket Médio */}
            <div className="hero-kpi">
              <div className="accent-bar" />
              <div className="label">Ticket Médio</div>
              <div className="val">{fmtBRL(report.totals.ticketMedio)}</div>
              <div className="sub">por convertida</div>
            </div>
            {/* 3. Novos Contatos */}
            <div className="hero-kpi purple">
              <div className="accent-bar" />
              <div className="label">Novos Contatos</div>
              <div className="val">{report.totals.novosContatos.toLocaleString("pt-BR")}</div>
              <div className="sub">no período</div>
            </div>
            {/* 4. Oportunidades */}
            <div className="hero-kpi">
              <div className="accent-bar" />
              <div className="label">Oportunidades</div>
              <div className="val">{report.totals.oportunidades.toLocaleString("pt-BR")}</div>
              <div className="sub">{report.totals.convertidas} convertidas</div>
            </div>
            {/* Agendamentos — matriz origem × status (qual canal perde mais em no-show, etc.) */}
            {report.appointments && (
              <div className="hero-kpi wide">
                <div className="accent-bar" style={{ background: "var(--accent-2)" }} />
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <div className="label">Agendamentos por origem × status</div>
                  <div className="val" style={{ fontSize: 24, marginTop: 0 }}>{report.appointments.total}</div>
                  <div className="sub" style={{ marginTop: 0 }}>no período</div>
                </div>
                <AppointmentsPieChart data={report.appointments} />
              </div>
            )}
          </div>

          {/* ========================================================================
              SEÇÃO 1: NOVOS CONTATOS
              Tudo que envolve aquisição / leads entra aqui, junto, sem repetição.
              ========================================================================= */}
          <h2>1. Novos Contatos</h2>
          <div className="note">
            <strong>Aquisição no período:</strong> {report.totals.novosContatos.toLocaleString("pt-BR")} novos contatos
            {report.totals.oportunidades > 0 && (
              <> • {report.totals.oportunidades.toLocaleString("pt-BR")} viraram oportunidade</>
            )}.
          </div>

          <h3>1.1 Por dia — segregado por origem da sessão</h3>
          {report.contactsByDaySource ? (
            <>
              <ContactsByDayChart data={report.contactsByDaySource} />
              <DaySourceTable data={report.contactsByDaySource} totalContacts={report.totals.novosContatos} />
            </>
          ) : (
            // snapshots antigos não têm a segregação por origem
            <ReportTable labelHeader="Data" rows={report.contactsByDay.map((r) => ({ ...r, label: fmtDateBR(r.label) }))} />
          )}

          <h3>1.2 Por origem (sessão) — top 6 visualizado em pizza</h3>
          <div className="row-2">
            <OriginPieChart rows={report.contactsBySourceSession} />
            <div style={{ alignSelf: "center" }}>
              <OriginLegend rows={report.contactsBySourceSession} />
            </div>
          </div>
          <h3>1.3 Por canal (meio)</h3>
          <ReportTable rows={report.contactsByChannel} />
          <h3>1.4 Cruzamento Sessão × Meio (top 10)</h3>
          <ReportTable rows={report.sessionXChannel} />

          {/* ========================================================================
              SEÇÃO 2: OPORTUNIDADES
              Funil por origem (5 estágios RevOps) + Ads (origem rastreada) + Performance
              por Origem (macro) — tudo do "meio do funil" de leads → receita.
              ========================================================================= */}
          {report.funnelByOrigin && report.funnelByOrigin.rows.length > 0 && (
            <>
              <h2>2. Oportunidades</h2>

              <h3>2.1 Funil de Vendas por Origem (5 estágios RevOps)</h3>
              <div className="note">
                5 estágios canônicos: <strong>Novos</strong> → <strong>Agendaram</strong> (appts new/confirmed/showed) →{" "}
                <strong>Virou oportunidade</strong> (opps Vendas, createdAt — não implica comparecimento) → <strong>Tat. agend.</strong> (stage &quot;Tatuagem agendada&quot;,{" "}
                <code>lastStageChangeAt</code>) → <strong>Converteram</strong> (won, <code>lastStageChangeAt</code>).{" "}
                O percentual em cada célula é <strong>sempre sobre o topo do funil</strong> (novos contatos do canal) — o briefing pediu essa referência fixa.{" "}
                Cor semafórica calibrada por estágio:{" "}
                <span style={{ color: "var(--green)" }}>verde</span> = saudável praquele estágio,{" "}
                <span style={{ color: "var(--yellow)" }}>amarelo</span> = perdeu algum volume,{" "}
                <span style={{ color: "var(--red)" }}>vermelho</span> = o canal não chega no fundo do funil.
                Canal = <code>sessionSource</code> nativo do GHL, com fallback em <code>Fonte do negócio</code> quando vazio/CRM UI.
              </div>
              <FunnelByOrigin data={report.funnelByOrigin} />
            </>
          )}

          <h3>{report.funnelByOrigin && report.funnelByOrigin.rows.length > 0 ? "2.2" : "2.1"} Performance por Origem (macro)</h3>
          {report.visitsByOrigin && (
            <div className="note" style={{ borderLeftColor: "var(--accent-2)" }}>
              <strong>Oportunidades por Origem</strong> — segregação por macro-origem do briefing (Artistas, Social Pago, Social Orgânico, Passante). A barra é proporcional ao total de oportunidades; o badge verde/amarelo/vermelho mostra a taxa de conversão.
            </div>
          )}
          {report.visitsByOrigin && <OriginBars data={report.visitsByOrigin} />}
          <PerformanceTable rows={report.byOrigin} />

          {/* ========================================================================
              SEÇÃO 3: ARTISTAS
              Performance do artista + origem dos clientes (clientes Capone vs clientes
              do próprio artista). Tudo de artista fica aqui, contíguo.
              ========================================================================= */}
          <h2>3. Artistas</h2>

          <h3>3.1 Performance por Artista</h3>
          <div className="note">Todos os artistas ativos no período (ao menos 1 lead decidido), ordenados por total vendido. Dois painéis com as mesmas linhas: à esquerda o <span style={{ color: "var(--cyan)" }}>total vendido</span> (escala R$); à direita os leads decididos (<span style={{ color: "var(--green)" }}>convertidos</span> + <span style={{ color: "var(--red)" }}>não convertidos</span> empilhados), com o % de conversão na ponta.</div>
          {report.byArtist.length > 0 && <ArtistPerformanceChart rows={report.byArtist} />}
          <PerformanceTable rows={report.byArtist} />

          <h3>3.2 Artista × grupo de clientes</h3>
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

          {/* ========================================================================
              SEÇÃO 4: SDRs (responsáveis pelas oportunidades)
              ========================================================================= */}
          <h2>4. Performance por SDR</h2>
          <div className="note">SDR = campo <strong>&quot;Dono do negócio&quot;</strong> da oportunidade no GHL.</div>
          <PerformanceTable rows={report.bySdr} />

          {/* ========================================================================
              SEÇÃO 5: Ads & Mídia Paga
              Tudo de ads (origem rastreada, custo de plataformas, eficiência) — fica
              numa seção só, depois de SDR, pra não poluir o funil de Vendas/Contatos.
              ========================================================================= */}
          {report.adsMetrics && (
            <>
              <h2>5. Ads & Mídia Paga</h2>
              <div className="note">
                Cliques, gasto, CPC e CTR reais vêm direto da Google Ads API / Meta Marketing API — o GHL não guarda investimento. Contatos/oportunidades/conversões continuam vindo do rastreamento do GHL (<code>fbclid</code>/<code>gclid_id</code>/<code>utm_source</code>).{" "}
                Definições de aquisição: <strong>MQL</strong> = lead que virou oportunidade; <strong>CPL/CPMQL/CAC globais</strong> são <em>blended</em> — investimento total em ads ÷ todos os leads/MQLs/clientes do período (inclusive orgânico e artistas); por plataforma, dividem o custo da plataforma pelos números atribuídos a ela.
              </div>

              {/* 5.1 Eficiência de aquisição — só renderiza quando há custo real de alguma plataforma */}
              {report.acquisition && report.acquisition.plataformasComCusto.length > 0 && (
                <>
                  <h3>5.1 Eficiência de aquisição (blended)</h3>
                  <div className="acq-grid">
                    <div className="ads-report-card" style={{ borderColor: "var(--cyan)" }}>
                      <div className="ads-report-stats" style={{ gridTemplateColumns: "1fr" }}>
                        <div>
                          <div className="label">CAC Global</div>
                          <div className="val" style={{ color: "var(--cyan)" }}>
                            {report.acquisition.cacGlobal != null ? fmtBRLPrecise(report.acquisition.cacGlobal) : "—"}
                          </div>
                          <div className="sub">investimento ÷ {report.acquisition.clientes} clientes convertidos</div>
                        </div>
                      </div>
                    </div>
                    <div className="ads-report-card">
                      <div className="ads-report-stats" style={{ gridTemplateColumns: "1fr" }}>
                        <div>
                          <div className="label">CPL Global</div>
                          <div className="val">
                            {report.acquisition.cplGlobal != null ? fmtBRLPrecise(report.acquisition.cplGlobal) : "—"}
                          </div>
                          <div className="sub">investimento ÷ {report.acquisition.leads.toLocaleString("pt-BR")} leads</div>
                        </div>
                      </div>
                    </div>
                    <div className="ads-report-card">
                      <div className="ads-report-stats" style={{ gridTemplateColumns: "1fr" }}>
                        <div>
                          <div className="label">CPMQL Global</div>
                          <div className="val">
                            {report.acquisition.cpmqlGlobal != null ? fmtBRLPrecise(report.acquisition.cpmqlGlobal) : "—"}
                          </div>
                          <div className="sub">investimento ÷ {report.acquisition.mqls} MQLs (viraram oportunidade)</div>
                        </div>
                      </div>
                    </div>
                    <div className="ads-report-card">
                      <div className="ads-report-stats" style={{ gridTemplateColumns: "1fr" }}>
                        <div>
                          <div className="label">Investimento Total</div>
                          <div className="val">{fmtBRL(report.acquisition.investimentoTotal)}</div>
                          <div className="sub">
                            ads no período ({report.acquisition.plataformasComCusto.map((p) => p === "google" ? "Google" : p === "facebook" ? "Meta" : p).join(" + ")})
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 5.2 Relatórios de plataforma — só renderiza se há custo real de Google ou Meta */}
              {(report.adsMetrics.google.custo != null || report.adsMetrics.facebook.custo != null) ? (
                <>
                  <h3>5.2 Relatórios de plataforma (cliques, gasto, CPC/CTR reais)</h3>
                  <div className="ads-report-grid">
                    {report.adsMetrics.google.custo != null && (
                      <div className="ads-report-card">
                        <div className="title">Relatório do Google Ads</div>
                        <div className="ads-report-stats">
                          <div>
                            <div className="label">Total de cliques</div>
                            <div className="val">{report.adsMetrics.google.cliques?.toLocaleString("pt-BR") ?? "—"}</div>
                          </div>
                          <div>
                            <div className="label">Valor total gasto</div>
                            <div className="val">{fmtBRL(report.adsMetrics.google.custo)}</div>
                          </div>
                          <div>
                            <div className="label">CPC</div>
                            <div className="val">{report.adsMetrics.google.cpc != null ? fmtBRLPrecise(report.adsMetrics.google.cpc) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CTR</div>
                            <div className="val">{report.adsMetrics.google.ctr != null ? fmtPct(report.adsMetrics.google.ctr) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CPL</div>
                            <div className="val">{report.adsMetrics.google.cpl != null ? fmtBRLPrecise(report.adsMetrics.google.cpl) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CPMQL</div>
                            <div className="val">{report.adsMetrics.google.cpmql != null ? fmtBRLPrecise(report.adsMetrics.google.cpmql) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CAC</div>
                            <div className="val">{report.adsMetrics.google.cpa != null ? fmtBRLPrecise(report.adsMetrics.google.cpa) : "—"}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {report.adsMetrics.facebook.custo != null && (
                      <div className="ads-report-card">
                        <div className="title">Relatório de Anúncios do Facebook</div>
                        <div className="ads-report-stats">
                          <div>
                            <div className="label">Total de cliques</div>
                            <div className="val">{report.adsMetrics.facebook.cliques?.toLocaleString("pt-BR") ?? "—"}</div>
                          </div>
                          <div>
                            <div className="label">Valor total gasto</div>
                            <div className="val">{fmtBRL(report.adsMetrics.facebook.custo)}</div>
                          </div>
                          <div>
                            <div className="label">CPC</div>
                            <div className="val">{report.adsMetrics.facebook.cpc != null ? fmtBRLPrecise(report.adsMetrics.facebook.cpc) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CTR</div>
                            <div className="val">{report.adsMetrics.facebook.ctr != null ? fmtPct(report.adsMetrics.facebook.ctr) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CPL</div>
                            <div className="val">{report.adsMetrics.facebook.cpl != null ? fmtBRLPrecise(report.adsMetrics.facebook.cpl) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CPMQL</div>
                            <div className="val">{report.adsMetrics.facebook.cpmql != null ? fmtBRLPrecise(report.adsMetrics.facebook.cpmql) : "—"}</div>
                          </div>
                          <div>
                            <div className="label">CAC</div>
                            <div className="val">{report.adsMetrics.facebook.cpa != null ? fmtBRLPrecise(report.adsMetrics.facebook.cpa) : "—"}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="note" style={{ borderLeftColor: "var(--yellow)" }}>
                  Cliques/gasto/CPC/CTR reais ainda não configurados. Defina as credenciais da Google Ads API e/ou Meta Marketing API no <code>.env</code> da API — ver comentários em <code>apps/api/src/env.ts</code>.
                </div>
              )}

              {/* 5.3 Performance por plataforma — sempre visível (volume do GHL, custo opcional via API) */}
              <h3>5.3 Performance por plataforma</h3>
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
                      <div className="stat-row"><span>Contatos</span><span className="v">{m.visitas.toLocaleString("pt-BR")}</span></div>
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
                          <div className="stat-row"><span>CAC</span><span className="v">{m.cpa ? fmtBRL(m.cpa) : "—"}</span></div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* 5.4–5.6: tabelas de origem que ajudam a auditar campanhas de ads.
              Não dependem de adsMetrics (são listagens de contatos), então ficam
              fora do bloco `report.adsMetrics && (...)` acima. */}
          <h3>5.4 Landing pages (top 10)</h3>
          <div className="note" style={{ marginTop: 4 }}>
            Páginas de destino que geraram contatos. A maioria vem de campanhas pagas (Meta/Google Ads); orgânico aparece com volume residual.
          </div>
          {report.topLandingPages.length > 0 ? (
            <table>
              <thead><tr><th>Landing Page</th><th className="num">Visitas (contatos)</th></tr></thead>
              <tbody>{report.topLandingPages.map((r) => <tr key={r.label}><td className="url-cell">{r.label}</td><td className="num">{r.count}</td></tr>)}</tbody>
            </table>
          ) : (
            <div className="note">Sem dados de landing pages no período.</div>
          )}

          <h3>5.5 Ad IDs (top 10)</h3>
          <div className="note" style={{ marginTop: 4 }}>
            IDs dos anúncios que trouxeram contatos. Cruzando com o gasto de cada ad (Meta/Google Ads) dá o CPA real por criativo.
          </div>
          {report.topAdIds.length > 0 ? (
            <table>
              <thead><tr><th>Ad ID</th><th className="num">Contatos</th></tr></thead>
              <tbody>{report.topAdIds.map((r) => <tr key={r.label}><td className="url-cell">{r.label}</td><td className="num">{r.count}</td></tr>)}</tbody>
            </table>
          ) : (
            <div className="note">Sem dados de ad IDs no período.</div>
          )}

          <h3>5.6 Source legado (top 10)</h3>
          <div className="note" style={{ marginTop: 4 }}>
            Versão antiga do campo <code>source</code> do contato (GHL v1). Útil pra auditar leads que entraram antes do tracking novo (UTM/fbclid/gclid) ser ativado.
          </div>
          <ReportTable rows={report.topLegacySources} />

          {/* ========================================================================
              SEÇÃO 6: Alertas e Observações
              ========================================================================= */}
          <h2>6. Alertas e Observações</h2>
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

          {/* ========================================================================
              SEÇÃO 7: Glossário
              Termos do funil Capone (GHL) + métricas do dashboard.
              ========================================================================= */}
          <h2>7. Glossário</h2>
          <div className="note" style={{ marginBottom: 12 }}>
            Termos usados neste relatório. Mantido curto — só o que afeta interpretação dos números.
          </div>
          <div className="cards" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            <div className="card">
              <div className="label">Pipeline de Vendas (GHL)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Funil principal onde a oportunidade nasce. 6 stages:
                <strong> Simulação realizada</strong> → <strong>Sinal</strong> → <strong>Sinal Pago</strong> → <strong>Tatuagem agendada</strong> → <strong>Ganho</strong> → <strong>Perdido</strong>.
              </div>
            </div>
            <div className="card">
              <div className="label">Pipeline Pós-vendas (GHL)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Onde a tatuagem é executada. 8 stages (M1..M8). <strong>Tudo conta como convertido</strong> — o cliente já pagou, é só a execução da tattoo.
              </div>
            </div>
            <div className="card">
              <div className="label">Convertida (won)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Oportunidade com stage <em>Ganho</em>, <em>Sinal Pago</em> ou <em>Tatuagem agendada</em> (Vendas) ou qualquer stage M1..M8 (Pós-vendas). Ganha receita.
              </div>
            </div>
            <div className="card">
              <div className="label">Não convertida (lost)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Stage <em>Perdido</em>, <em>Simulação realizada</em> ou <em>Sinal</em> (Vendas). <strong>Critério rígido</strong>: só conta quando o cliente fala explicitamente &quot;não tenho interesse&quot;. Leads em aberto (open) não viram lost.
              </div>
            </div>
            <div className="card">
              <div className="label">Taxa de conversão</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                <code>convertidas ÷ decididas</code>, onde <em>decididas</em> = convertidas + não convertidas. Open (em andamento) não entra no denominador.
              </div>
            </div>
            <div className="card">
              <div className="label">Ticket médio</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                <code>receita convertida ÷ número de convertidas</code>. Valor médio por tatuagem fechada.
              </div>
            </div>
            <div className="card">
              <div className="label">Macro-origem (briefing)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                4 buckets canônicos: <strong>Artistas</strong>, <strong>Social Pago</strong>, <strong>Social Orgânico</strong>, <strong>Passante</strong>. Vem do custom field <code>Fonte do negócio</code> (id <code>Z9V5sduzueNFxPbqtqGh</code>).
              </div>
            </div>
            <div className="card">
              <div className="label">Session source (sessão)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Como o contato chegou: <em>Paid Social</em>, <em>Paid Search</em>, <em>Social media</em>, <em>Organic Search</em>, <em>Direct traffic</em>, <em>CRM UI</em>. Valor nativo do GHL no contato.
              </div>
            </div>
            <div className="card">
              <div className="label">Show rate (agendamento)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                <code>compareceu ÷ total agendado da origem</code>. Semafórico: verde ≥70%, amarelo 40–70%, vermelho &lt;40%.
              </div>
            </div>
            <div className="card">
              <div className="label">Funil de Vendas por Origem (5 estágios)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                RevOps canônico: <strong>Novos</strong> → <strong>Agendaram</strong> → <strong>Virou oportunidade</strong> → <strong>Tat. agend.</strong> → <strong>Converteram</strong>. % de cada célula é sempre sobre o topo (novos do canal).
              </div>
            </div>
            <div className="card">
              <div className="label">MQL (Marketing Qualified Lead)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Contato que virou oportunidade no funil de Vendas. Usado pra calcular <strong>CPMQL</strong> (custo ÷ MQLs) e <strong>CAC</strong> (custo ÷ clientes).
              </div>
            </div>
            <div className="card">
              <div className="label">SDR (&quot;Dono do negócio&quot;)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Responsável pela oportunidade no GHL. Custom field da opportunity que identifica o vendedor/closer.
              </div>
            </div>
            <div className="card">
              <div className="label">Tracking de ads (fbclid/gclid/utm)</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                <code>fbclid</code> = Meta Ads · <code>gclid_id</code> = Google Ads · <code>utm_source</code> = heurística. Cobertura &lt;10% aciona alerta de pixel/conector quebrado.
              </div>
            </div>
            <div className="card">
              <div className="label">Excluído: Arlon</div>
              <div className="sub" style={{ color: "var(--ink)", lineHeight: 1.6, marginTop: 6 }}>
                Artista removido do relatório por regra de negócio (não contabilizado nos totais nem nos rankings).
              </div>
            </div>
          </div>

          <div className="footer">
            {report.cacheHit ? `Cache (${report.cacheAgeSeconds}s atrás)` : "Recém-calculado"} • {report.totals.novosContatos} contatos • {report.totals.oportunidades} opps • {report.totals.convertidas} convertidas • {fmtBRL(report.totals.receitaConvertida)} receita
          </div>
        </>
      )}
    </div>
  );
}
