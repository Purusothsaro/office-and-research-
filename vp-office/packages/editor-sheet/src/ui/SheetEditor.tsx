import { UniverSheetsConditionalFormattingPreset } from "@univerjs/preset-sheets-conditional-formatting";
import cfEnUS from "@univerjs/preset-sheets-conditional-formatting/locales/en-US";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import coreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import dvEnUS from "@univerjs/preset-sheets-data-validation/locales/en-US";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import filterEnUS from "@univerjs/preset-sheets-filter/locales/en-US";
import "@univerjs/preset-sheets-filter/lib/index.css";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import findEnUS from "@univerjs/preset-sheets-find-replace/locales/en-US";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import { UniverSheetsHyperLinkPreset } from "@univerjs/preset-sheets-hyper-link";
import linkEnUS from "@univerjs/preset-sheets-hyper-link/locales/en-US";
import "@univerjs/preset-sheets-hyper-link/lib/index.css";
import { UniverSheetsNotePreset } from "@univerjs/preset-sheets-note";
import noteEnUS from "@univerjs/preset-sheets-note/locales/en-US";
import "@univerjs/preset-sheets-note/lib/index.css";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import sortEnUS from "@univerjs/preset-sheets-sort/locales/en-US";
import "@univerjs/preset-sheets-sort/lib/index.css";
import { CommandType, createUniver, LocaleType, mergeLocales, type FUniver } from "@univerjs/presets";
import { useEffect, useRef, useState } from "react";
import { getResource, RESOURCE, setResource, type ChartSpec, type WorkbookData } from "../snapshot";
import { ChartsPanel } from "./ChartsPanel";
import "./sheet-editor.css";

export interface SheetEditorProps {
  initial: WorkbookData;
  onChange: (workbook: WorkbookData) => void;
  showCharts: boolean;
  onCloseCharts: () => void;
  /** Exposes the Univer facade (tests and host actions). */
  onReady?: (api: FUniver) => void;
}

/**
 * Univer-based spreadsheet. Charts are kept outside Univer (its chart module
 * is commercial) and merged into the snapshot under our own resource.
 */
export function SheetEditor({ initial, onChange, showCharts, onCloseCharts, onReady }: SheetEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<FUniver | null>(null);
  const [charts, setCharts] = useState<ChartSpec[]>(() => getResource<ChartSpec[]>(initial, RESOURCE.charts) ?? []);
  const [version, setVersion] = useState(0);
  const chartsRef = useRef(charts);
  chartsRef.current = charts;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const emitRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Each Univer instance gets its own host so a deferred dispose can't touch a newer one.
    const el = document.createElement("div");
    el.className = "sheet-univer-host";
    container.current!.append(el);
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: mergeLocales(coreEnUS, sortEnUS, filterEnUS, dvEnUS, cfEnUS, findEnUS, linkEnUS, noteEnUS) },
      presets: [
        UniverSheetsCorePreset({ container: el, header: true, footer: { sheetBar: true, statisticBar: true } } as never),
        UniverSheetsSortPreset(),
        UniverSheetsFilterPreset(),
        UniverSheetsDataValidationPreset(),
        UniverSheetsConditionalFormattingPreset(),
        UniverSheetsFindReplacePreset(),
        UniverSheetsHyperLinkPreset(),
        UniverSheetsNotePreset(),
      ],
    });
    // Univer drops resources it doesn't own, so our charts are merged back in on save.
    const { resources, ...data } = initial;
    univerAPI.createWorkbook({ ...data, resources: (resources ?? []).filter((r) => r.name !== RESOURCE.charts) } as never);

    let last = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Opening runs the formula engine, which writes results with the same
    // mutations as user edits. Until the first calculation settles, changes
    // only update the baseline instead of counting as edits.
    let settling = true;
    const emit = () => {
      const book = univerAPI.getActiveWorkbook();
      if (!book) return;
      const snapshot = book.save() as unknown as WorkbookData;
      setResource(snapshot, RESOURCE.charts, chartsRef.current);
      const json = JSON.stringify(snapshot);
      if (json === last) return;
      last = json;
      setVersion((v) => v + 1);
      if (!settling) onChangeRef.current(snapshot);
    };
    let settleTimer = setTimeout(() => {
      emit();
      settling = false;
    }, 1500);
    emitRef.current = emit;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(emit, 250);
    };
    const subscription = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
      if (event.type !== CommandType.MUTATION) return;
      if (settling) {
        if (event.id === "formula.mutation.set-formula-calculation-result") {
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => {
            emit();
            settling = false;
          }, 300);
        }
        return;
      }
      // Formula bookkeeping and in-cell editor drafts aren't document changes by themselves.
      if (event.id.startsWith("formula.mutation.set-formula-calculation") || event.id.startsWith("formula.mutation.set-trigger") || event.id.startsWith("doc.")) return;
      schedule();
    });
    // Closing or hiding the tab must not lose the last edit still waiting on the debounce.
    const flushNow = () => {
      if (settling) return;
      clearTimeout(timer);
      emit();
    };
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", flushNow);
    setApi(univerAPI);
    onReady?.(univerAPI);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", flushNow);
      clearTimeout(timer);
      clearTimeout(settleTimer);
      if (!settling) emit();
      subscription.dispose();
      // Disposing synchronously during React's commit makes Univer unmount its own React root mid-render.
      setTimeout(() => {
        univer.dispose();
        el.remove();
      }, 0);
    };
    // Univer owns the grid after creation; initial data is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCharts = (next: ChartSpec[]) => {
    setCharts(next);
    chartsRef.current = next;
    emitRef.current();
    // Charts changing alone doesn't alter Univer's data; force a report.
    const book = api?.getActiveWorkbook();
    if (book) {
      const snapshot = book.save() as unknown as WorkbookData;
      setResource(snapshot, RESOURCE.charts, next);
      onChangeRef.current(snapshot);
    }
  };

  return (
    <div className="sheet-editor">
      <div ref={container} className="sheet-univer" data-testid="sheet-grid" />
      {showCharts && api && <ChartsPanel api={api} charts={charts} version={version} onChange={updateCharts} onClose={onCloseCharts} />}
    </div>
  );
}
