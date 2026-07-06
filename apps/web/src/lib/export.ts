"use client";
/**
 * Export do relatório:
 *  - exportPdf: renderiza o DOM, captura com html2canvas, monta PDF paginado via jsPDF.
 *  - exportCsv: serializa as principais tabelas (totals, pipelineBreakdown, byArtist, byCloser).
 *  - shareLink: copia URL com snapshot do período pro clipboard.
 *
 * Tudo client-side, sem backend. Custo zero.
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { Report } from "@capone/shared";

function ts() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function escapeCsv(s: unknown): string {
  if (s == null) return "";
  const v = String(s);
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export PDF do dashboard. Captura o elemento #dashboard-root, pagina A4 landscape. */
export async function exportPdf(elementId = "dashboard-root", report: Report): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`#${elementId} nao encontrado`);

  // Render otimizado: fundo escuro, escala 1.5x (nitido), usa Canvas API
  const canvas = await html2canvas(el, {
    backgroundColor: "#0b1020",
    scale: 1.5,
    useCORS: true,
    logging: false,
    // Ignora botoes (toolbar) na captura
    ignoreElements: (node) => node.classList?.contains("no-export") ?? false,
  });
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  // jsPDF: A4 landscape (297mm x 210mm)
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();   // 297
  const pageH = pdf.internal.pageSize.getHeight();  // 210
  const margin = 8;

  // Header com titulo + periodo
  pdf.setFillColor(11, 16, 32);
  pdf.rect(0, 0, pageW, pageH, "F"); // bg dark em cada pagina

  // Calcula proporcoes
  const imgRatio = canvas.height / canvas.width;
  const availableW = pageW - margin * 2;
  const availableH = pageH - margin * 2 - 14; // 14mm pro header
  let renderW = availableW;
  let renderH = renderW * imgRatio;
  if (renderH > availableH) {
    renderH = availableH;
    renderW = renderH / imgRatio;
  }

  // Header
  pdf.setTextColor(233, 238, 252);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Dashboard GHL - Capone Club", margin, margin + 4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(139, 148, 184);
  pdf.text(
    `Periodo: ${report.period.start} a ${report.period.end}  •  Gerado em ${new Date(report.generatedAt).toLocaleString("pt-BR")}`,
    margin,
    margin + 9,
  );

  // Paginar: se a imagem for maior que 1 pagina, divide em N paginas
  if (renderH <= availableH) {
    pdf.addImage(imgData, "JPEG", margin, margin + 12, renderW, renderH);
  } else {
    // Divide o canvas em fatias
    const sliceHeightCanvas = Math.floor((availableH / renderH) * canvas.height);
    let yOffset = 0;
    let page = 0;
    while (yOffset < canvas.height) {
      if (page > 0) pdf.addPage();
      // Mesma logica de header dark
      pdf.setFillColor(11, 16, 32);
      pdf.rect(0, 0, pageW, pageH, "F");
      const h = Math.min(sliceHeightCanvas, canvas.height - yOffset);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = h;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context nao disponivel");
      ctx.drawImage(canvas, 0, yOffset, canvas.width, h, 0, 0, canvas.width, h);
      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(sliceData, "JPEG", margin, margin + 12, renderW, (h / canvas.height) * renderH);
      yOffset += h;
      page++;
    }
  }

  pdf.setProperties({
    title: `Capone Dashboard ${report.period.start} a ${report.period.end}`,
    subject: "Relatorio mensal GHL - Capone Club",
    author: userEmail() ?? "Capone Dashboard",
    creator: "Capone Dashboard",
  });

  pdf.save(`capone-dashboard_${report.period.start}_a_${report.period.end}_${ts()}.pdf`);
}

function userEmail(): string | null {
  try {
    return document.querySelector('meta[name="user-email"]')?.getAttribute("content") ?? null;
  } catch {
    return null;
  }
}

/** Export CSV multi-tabela (totals, pipeline, artista, closer). */
export function exportCsv(report: Report): void {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  // Header
  push(`# Capone Dashboard — ${report.period.start} a ${report.period.end}`);
  push(`# Gerado em ${new Date(report.generatedAt).toLocaleString("pt-BR")}`);
  push("");

  // Totals
  push("## Totals");
  push("metrica,valor");
  const t = report.totals;
  push(`Novos contatos,${t.novosContatos}`);
  push(`Oportunidades,${t.oportunidades}`);
  push(`Convertidas,${t.convertidas}`);
  push(`Nao convertidas,${t.naoConvertidas}`);
  push(`Taxa de conversao,${(t.taxaConversao * 100).toFixed(1)}%`);
  push(`Receita convertida,${t.receitaConvertida.toFixed(2)}`);
  push(`Ticket medio,${t.ticketMedio.toFixed(2)}`);
  push(`Cycle time mediana (d),${t.cycleTimeMedianaDias.toFixed(1)}`);
  push(`Artistas no mes,${t.artistasNoMes}`);
  push(`Closers no mes,${t.closersNoMes}`);
  push("");

  // Pipeline
  push("## Performance por Pipeline");
  push("pipeline,total,convertidos,nao convertidos,taxa conversao,receita convertida");
  for (const p of report.pipelineBreakdown) {
    push([
      p.pipeline,
      p.total,
      p.convertidos,
      p.naoConvertidos,
      (p.taxaConversao * 100).toFixed(1) + "%",
      p.receitaConvertida.toFixed(2),
    ].map(escapeCsv).join(","));
  }
  push("");

  // Por artista
  push("## Performance por Artista");
  push("artista,total,convertidos,nao convertidos,taxa conversao,ticket medio,receita");
  for (const a of report.byArtist) {
    push([
      a.label,
      a.total,
      a.convertidos,
      a.naoConvertidos,
      (a.taxaConversao * 100).toFixed(1) + "%",
      a.ticketMedio.toFixed(2),
      a.receitaConvertida.toFixed(2),
    ].map(escapeCsv).join(","));
  }
  push("");

  // Por closer
  push("## Performance por Closer");
  push("closer,total,convertidos,nao convertidos,taxa conversao,ticket medio,receita");
  for (const c of report.byCloser) {
    push([
      c.label,
      c.total,
      c.convertidos,
      c.naoConvertidos,
      (c.taxaConversao * 100).toFixed(1) + "%",
      c.ticketMedio.toFixed(2),
      c.receitaConvertida.toFixed(2),
    ].map(escapeCsv).join(","));
  }

  const csv = lines.join("\n");
  // BOM para Excel reconhecer UTF-8
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `capone-dashboard_${report.period.start}_a_${report.period.end}_${ts()}.csv`);
}

/** Copia URL com snapshot do período pro clipboard. */
export async function shareLink(period: { start: string; end: string }): Promise<void> {
  const url = `${window.location.origin}/?start=${period.start}&end=${period.end}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
