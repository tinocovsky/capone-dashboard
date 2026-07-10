"use client";
/**
 * DateRangePicker — range picker custom, zero deps, tema dark.
 *
 * Comportamento:
 *  - Botão trigger com label "1 jul – 31 jul de 2026" (ou "Selecionar período")
 *  - Popover com 2 calendários lado-a-lado (desktop) ou 1 (mobile)
 *  - Navegação mês-a-mês (← →)
 *  - Range: 1º clique define start, 2º clique define end. Hover mostra preview.
 *  - Atalhos no rodapé: Hoje, Ontem, Últimos 7d/30d, Este mês, Mês passado, YTD
 *  - ESC fecha, click outside fecha, Tab navega
 *  - ARIA: button, dialog, gridcell, aria-label em cada dia
 *
 * API:
 *  <DateRangePicker
 *    value={{ start: "2026-07-01", end: "2026-07-31" }}
 *    onChange={({ start, end }) => { ... }}
 *    disabled?: boolean
 *  />
 *
 * Datas são strings YYYY-MM-DD (sem timezone — comparamos como string).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_PT_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_SEMANA_PT_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type ISODate = string; // "YYYY-MM-DD"

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function inRange(d: Date, start: ISODate, end: ISODate): boolean {
  const iso = toISO(d);
  return iso >= start && iso <= end;
}

interface Preset {
  label: string;
  apply: () => DateRange;
}

function buildPresets(): Preset[] {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tMinus = (n: number) => {
    const d = new Date(t);
    d.setDate(d.getDate() - n);
    return d;
  };
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { label: "Hoje", apply: () => ({ start: toISO(t), end: toISO(t) }) },
    { label: "Ontem", apply: () => ({ start: toISO(tMinus(1)), end: toISO(tMinus(1)) }) },
    { label: "Últimos 7 dias", apply: () => ({ start: toISO(tMinus(6)), end: toISO(t) }) },
    { label: "Últimos 30 dias", apply: () => ({ start: toISO(tMinus(29)), end: toISO(t) }) },
    { label: "Este mês", apply: () => ({ start: toISO(monthStart), end: toISO(monthEnd) }) },
    { label: "Mês passado", apply: () => ({ start: toISO(lastMonthStart), end: toISO(lastMonthEnd) }) },
    {
      label: "YTD",
      apply: () => ({ start: toISO(new Date(today.getFullYear(), 0, 1)), end: toISO(t) }),
    },
  ];
}

/** Grade de 6×7 (semanas) pra um mês, começando no domingo. */
function buildMonthGrid(month: Date): Date[][] {
  const first = startOfMonth(month);
  const startWeekday = first.getDay(); // 0=dom
  const start = new Date(first);
  start.setDate(start.getDate() - startWeekday);
  const weeks: Date[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function formatRangeLabel(range: DateRange): string {
  const s = fromISO(range.start);
  const e = fromISO(range.end);
  // Mesmo dia
  if (isSameDay(s, e)) {
    return `${s.getDate()} de ${MESES_PT[s.getMonth()]} de ${s.getFullYear()}`;
  }
  // Mesmo mês
  if (isSameMonth(s, e)) {
    return `${s.getDate()} – ${e.getDate()} de ${MESES_PT[s.getMonth()]} de ${s.getFullYear()}`;
  }
  // Meses diferentes, mesmo ano
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} ${MESES_PT_SHORT[s.getMonth()]} – ${e.getDate()} ${MESES_PT_SHORT[e.getMonth()]} de ${s.getFullYear()}`;
  }
  return `${s.getDate()} ${MESES_PT_SHORT[s.getMonth()]} ${s.getFullYear()} – ${e.getDate()} ${MESES_PT_SHORT[e.getMonth()]} ${e.getFullYear()}`;
}

export function DateRangePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Inicializa o mês com o start atual (lazy init — só roda na montagem).
  // Não sincroniza com value.start em effect (regra react-hooks/set-state-in-effect);
  // se o user trocar o start externamente enquanto o popover está aberto,
  // o calendário continua no mês que ele estava navegando. UX aceitável.
  const [leftMonth, setLeftMonth] = useState<Date>(() => startOfMonth(fromISO(value.start)));
  const [pendingStart, setPendingStart] = useState<ISODate | null>(null);
  const [pendingEnd, setPendingEnd] = useState<ISODate | null>(null);
  const [hover, setHover] = useState<ISODate | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Detecta mobile (1 calendário vs 2)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(max-width: 720px)");
    const apply = () => setIsMobile(m.matches);
    apply();
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, []);

  // Click outside fecha
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Segundo mês (à direita) é sempre o próximo do esquerdo
  const rightMonth = useMemo(() => addMonths(leftMonth, 1), [leftMonth]);

  // Range em construção (preview) ou range confirmado
  const range: DateRange = useMemo(() => {
    if (pendingStart && pendingEnd) return { start: pendingStart, end: pendingEnd };
    if (pendingStart && hover) {
      // Preview durante hover: ordena caso hover < start
      const lo = pendingStart <= hover ? pendingStart : hover;
      const hi = pendingStart <= hover ? hover : pendingStart;
      return { start: lo, end: hi };
    }
    return value;
  }, [pendingStart, pendingEnd, hover, value]);

  const handleDayClick = useCallback(
    (iso: ISODate) => {
      if (pendingStart && !pendingEnd) {
        // Segundo clique — fecha o range
        const lo = pendingStart <= iso ? pendingStart : iso;
        const hi = pendingStart <= iso ? iso : pendingStart;
        setPendingStart(null);
        setPendingEnd(null);
        setHover(null);
        onChange({ start: lo, end: hi });
        // Não fecha — deixa user ajustar ou usar preset
      } else {
        // Primeiro clique
        setPendingStart(iso);
        setPendingEnd(null);
      }
    },
    [pendingStart, pendingEnd, onChange],
  );

  const handleDayHover = useCallback(
    (iso: ISODate) => {
      if (pendingStart && !pendingEnd) setHover(iso);
    },
    [pendingStart, pendingEnd],
  );

  const applyPreset = useCallback(
    (p: Preset) => {
      const r = p.apply();
      onChange(r);
      setLeftMonth(startOfMonth(fromISO(r.start)));
      setPendingStart(null);
      setPendingEnd(null);
      setHover(null);
    },
    [onChange],
  );

  const clear = useCallback(() => {
    setPendingStart(null);
    setPendingEnd(null);
    setHover(null);
  }, []);

  // Classes de células
  const cellClass = (d: Date, monthRef: Date): string => {
    const iso = toISO(d);
    const inMonth = isSameMonth(d, monthRef);
    const today = toISO(new Date());
    const classes: string[] = ["drp-day"];
    if (!inMonth) classes.push("drp-day-out");
    if (iso === today) classes.push("drp-day-today");
    if (inRange(d, range.start, range.end)) classes.push("drp-day-in-range");
    if (iso === range.start) classes.push("drp-day-start");
    if (iso === range.end) classes.push("drp-day-end");
    return classes.join(" ");
  };

  const renderMonth = (month: Date) => {
    const weeks = buildMonthGrid(month);
    return (
      <div className="drp-month">
        <div className="drp-month-name">
          {MESES_PT[month.getMonth()]} <span className="drp-year">{month.getFullYear()}</span>
        </div>
        <div className="drp-weekdays" role="row">
          {DIAS_SEMANA_PT_SHORT.map((d) => (
            <div key={d} className="drp-weekday" role="columnheader">
              {d}
            </div>
          ))}
        </div>
        <div className="drp-grid" role="grid">
          {weeks.flat().map((d, i) => {
            const iso = toISO(d);
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                className={cellClass(d, month)}
                aria-label={`${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`}
                aria-selected={inRange(d, range.start, range.end)}
                onClick={() => handleDayClick(iso)}
                onMouseEnter={() => handleDayHover(iso)}
                tabIndex={-1}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const label = formatRangeLabel(value);

  return (
    <div className="drp-root" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="drp-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
      >
        <span className="drp-icon" aria-hidden>📅</span>
        <span className="drp-label">{label}</span>
        <span className="drp-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div
          id={popoverId}
          className="drp-popover"
          role="dialog"
          aria-label="Seletor de período"
          onMouseLeave={() => setHover(null)}
        >
          <div className="drp-header">
            <button
              type="button"
              className="drp-nav"
              onClick={() => setLeftMonth((m) => addMonths(m, -1))}
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <div className="drp-nav-spacer" />
            {!isMobile && <div className="drp-nav-spacer" />}
            <button
              type="button"
              className="drp-nav"
              onClick={() => setLeftMonth((m) => addMonths(m, 1))}
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>
          <div className={`drp-body ${isMobile ? "drp-body-single" : ""}`}>
            {renderMonth(leftMonth)}
            {!isMobile && renderMonth(rightMonth)}
          </div>
          <div className="drp-presets">
            {buildPresets().map((p) => (
              <button
                key={p.label}
                type="button"
                className="drp-preset"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="drp-footer">
            <div className="drp-hint">
              {pendingStart && !pendingEnd
                ? "Selecione o dia final"
                : "Clique no dia inicial, depois no final"}
            </div>
            <div className="drp-footer-actions">
              {(pendingStart || pendingEnd) && (
                <button type="button" className="drp-action" onClick={clear}>
                  Limpar seleção
                </button>
              )}
              <button type="button" className="drp-action drp-action-primary" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
