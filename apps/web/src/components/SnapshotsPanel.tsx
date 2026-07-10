"use client";
/**
 * Painel de snapshots salvos: lista GET /api/reports/snapshots e permite
 * abrir um snapshot (o dashboard carrega o report congelado via onSelect).
 */
import { useEffect, useState } from "react";
import { supabaseBrowser, authedFetch } from "@/lib/supabase-browser";
import { fmtPeriod } from "@/lib/format";

export interface SnapshotMeta {
  id: string;
  period_start: string;
  period_end: string;
  created_at: string;
  note: string | null;
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function SnapshotsPanel({
  onSelect,
  onError,
}: {
  onSelect: (snap: SnapshotMeta) => void;
  onError: (msg: string) => void;
}) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: sess } = await supabaseBrowser().auth.getSession();
        const r = await authedFetch(
          `${process.env.NEXT_PUBLIC_API_BASE}/api/reports/snapshots`,
          {},
          sess.session,
        );
        if (cancelled) return;
        if (!r.ok) {
          onError(`Falha ao listar snapshots (${r.status})`);
          setSnapshots([]);
        } else {
          const { snapshots } = await r.json();
          setSnapshots(snapshots ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || snapshots === null) {
    return <div className="note" style={{ marginTop: 8 }}>Carregando snapshots...</div>;
  }
  if (!snapshots.length) {
    return (
      <div className="note" style={{ marginTop: 8 }}>
        Nenhum snapshot salvo ainda. Use o botão <strong>Salvar snapshot</strong> para congelar o relatório atual.
      </div>
    );
  }
  return (
    <table style={{ marginTop: 8 }}>
      <thead>
        <tr>
          <th>Período</th>
          <th>Salvo em</th>
          <th>Nota</th>
          <th className="num" />
        </tr>
      </thead>
      <tbody>
        {snapshots.map((s) => (
          <tr key={s.id}>
            <td><strong>{fmtPeriod(s.period_start, s.period_end)}</strong></td>
            <td>{fmtDateTime(s.created_at)}</td>
            <td style={{ color: "var(--muted)" }}>{s.note ?? "—"}</td>
            <td className="num">
              <button className="pill-btn" onClick={() => onSelect(s)}>Abrir</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
