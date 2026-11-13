import type { FUniver } from "@univerjs/presets";
import { BarChart3, LineChart, PieChart, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rangeRef, type ChartSpec } from "../snapshot";

type EChartsModule = typeof import("echarts");

function chartData(api: FUniver, spec: ChartSpec): { categories: string[]; series: { name: string; values: number[] }[] } {
  const book = api.getActiveWorkbook();
  const sheet = book?.getSheetBySheetId(spec.sheetId);
  if (!sheet) return { categories: [], series: [] };
  const values = sheet.getRange(rangeRef(spec.range)).getValues() as (string | number | boolean | null)[][];
  const rows = spec.headers ? values.slice(1) : values;
  const header = spec.headers ? (values[0] ?? []) : [];
  const firstColLabels = rows.every((r) => typeof r[0] !== "number");
  const categories = firstColLabels ? rows.map((r) => String(r[0] ?? "")) : rows.map((_, i) => String(i + 1));
  const start = firstColLabels ? 1 : 0;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const series: { name: string; values: number[] }[] = [];
  for (let c = start; c < width; c++) {
    series.push({ name: String(header[c] ?? `Series ${c - start + 1}`), values: rows.map((r) => (typeof r[c] === "number" ? (r[c] as number) : Number(r[c]) || 0)) });
  }
  return { categories, series };
}

function Chart({ api, spec, version, echarts }: { api: FUniver; spec: ChartSpec; version: number; echarts: EChartsModule }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = echarts.init(el.current!, undefined, { renderer: "svg" });
    const { categories, series } = chartData(api, spec);
    chart.setOption(
      spec.type === "pie"
        ? {
            title: { text: spec.title, left: "center", textStyle: { fontSize: 13 } },
            tooltip: { trigger: "item" },
            series: [{ type: "pie", radius: "60%", top: 24, data: categories.map((name, i) => ({ name, value: series[0]?.values[i] ?? 0 })) }],
          }
        : {
            title: { text: spec.title, left: "center", textStyle: { fontSize: 13 } },
            tooltip: { trigger: "axis" },
            legend: { bottom: 0, type: "scroll" },
            grid: { left: 40, right: 12, top: 36, bottom: 40 },
            xAxis: { type: "category", data: categories },
            yAxis: { type: "value" },
            series: series.map((s) => ({ name: s.name, type: spec.type, data: s.values })),
          },
      true,
    );
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el.current!);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [api, spec, version, echarts]);
  return <div ref={el} className="sheet-chart" role="img" aria-label={`${spec.type} chart: ${spec.title}`} />;
}

/** Charts drawn from sheet ranges; they update as the data changes. */
export function ChartsPanel({ api, charts, version, onChange, onClose }: { api: FUniver; charts: ChartSpec[]; version: number; onChange: (c: ChartSpec[]) => void; onClose: () => void }) {
  const [echarts, setEcharts] = useState<EChartsModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void import("echarts").then(setEcharts);
  }, []);

  const add = (type: ChartSpec["type"]) => {
    const book = api.getActiveWorkbook();
    const range = book?.getActiveRange();
    const sheet = book?.getActiveSheet();
    if (!range || !sheet) return;
    const r = range.getRange();
    if (r.endRow === r.startRow && r.endColumn === r.startColumn) {
      setError("Select the data for the chart first (including a header row).");
      return;
    }
    setError(null);
    onChange([
      ...charts,
      {
        id: Math.random().toString(36).slice(2, 10),
        sheetId: sheet.getSheetId(),
        type,
        title: `${sheet.getSheetName()} ${rangeRef(r)}`,
        range: { startRow: r.startRow, endRow: r.endRow, startColumn: r.startColumn, endColumn: r.endColumn },
        headers: true,
      },
    ]);
  };

  return (
    <aside className="sheet-charts" aria-label="Charts">
      <div className="sheet-charts-head">
        <h2>Charts</h2>
        <button type="button" aria-label="Close charts" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <p className="px-3 text-xs text-slate-500">Select a range with a header row, then choose a chart type.</p>
      <div className="flex gap-2 px-3 py-2">
        <button type="button" className="sheet-chart-btn" onClick={() => add("bar")}>
          <BarChart3 aria-hidden className="size-4" /> Bar
        </button>
        <button type="button" className="sheet-chart-btn" onClick={() => add("line")}>
          <LineChart aria-hidden className="size-4" /> Line
        </button>
        <button type="button" className="sheet-chart-btn" onClick={() => add("pie")}>
          <PieChart aria-hidden className="size-4" /> Pie
        </button>
      </div>
      {error && (
        <p role="alert" className="px-3 text-xs text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-3 p-3">
        {charts.map((spec) => (
          <li key={spec.id} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="mb-1 flex items-center gap-2">
              <input
                aria-label="Chart title"
                defaultValue={spec.title}
                className="min-w-0 flex-1 rounded border border-transparent px-1 text-sm hover:border-slate-200 focus:border-slate-300"
                onBlur={(e) => e.currentTarget.value !== spec.title && onChange(charts.map((c) => (c.id === spec.id ? { ...c, title: e.currentTarget.value } : c)))}
              />
              <button type="button" aria-label={`Delete chart ${spec.title}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => onChange(charts.filter((c) => c.id !== spec.id))}>
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
            {echarts ? <Chart api={api} spec={spec} version={version} echarts={echarts} /> : <p className="text-xs text-slate-500">Loading…</p>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
