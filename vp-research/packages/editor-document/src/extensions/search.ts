import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchMatch {
  from: number;
  to: number;
}

interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  current: number;
  decorations: DecorationSet;
}

export const searchKey = new PluginKey<SearchState>("search");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    search: {
      setSearch: (query: string, caseSensitive?: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

/** Finds matches within each textblock; inline atoms count as one character. */
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): SearchMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) positions.push(start + i);
        text += child.text;
      } else {
        positions.push(start);
        text += "￼";
      }
    });
    const hay = caseSensitive ? text : text.toLowerCase();
    let index = hay.indexOf(needle);
    while (index >= 0) {
      matches.push({ from: positions[index]!, to: positions[index + needle.length - 1]! + 1 });
      index = hay.indexOf(needle, index + needle.length);
    }
    return false;
  });
  return matches;
}

function build(doc: PMNode, query: string, caseSensitive: boolean, current: number): SearchState {
  const matches = findMatches(doc, query, caseSensitive);
  const index = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : -1;
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === index ? "doc-search-match doc-search-current" : "doc-search-match" })),
  );
  return { query, caseSensitive, matches, current: index, decorations };
}

export const SearchReplace = Extension.create({
  name: "search",

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: (_, state) => build(state.doc, "", false, -1),
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
            if (meta) return build(newState.doc, meta.query ?? value.query, meta.caseSensitive ?? value.caseSensitive, meta.current ?? value.current);
            if (tr.docChanged && value.query) return build(newState.doc, value.query, value.caseSensitive, value.current);
            return value;
          },
        },
        props: { decorations: (state) => searchKey.getState(state)?.decorations },
      }),
    ];
  },

  addCommands() {
    const select = (index: number) =>
      ({ state, tr, dispatch }: { state: import("@tiptap/pm/state").EditorState; tr: import("@tiptap/pm/state").Transaction; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void }) => {
        const s = searchKey.getState(state);
        if (!s || s.matches.length === 0) return false;
        const i = (index + s.matches.length) % s.matches.length;
        const m = s.matches[i]!;
        if (dispatch) dispatch(tr.setMeta(searchKey, { current: i }).setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView());
        return true;
      };
    return {
      setSearch:
        (query, caseSensitive = false) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(searchKey, { query, caseSensitive, current: 0 }));
          return true;
        },
      findNext:
        () =>
        (props) => {
          const s = searchKey.getState(props.state);
          return select((s?.current ?? -1) + 1)(props);
        },
      findPrevious:
        () =>
        (props) => {
          const s = searchKey.getState(props.state);
          return select((s?.current ?? 0) - 1)(props);
        },
      replaceCurrent:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state);
          const m = s?.matches[s.current];
          if (!s || !m) return false;
          if (dispatch) {
            tr.insertText(replacement, m.from, m.to);
            dispatch(tr.setMeta(searchKey, { current: s.current }));
          }
          return true;
        },
      replaceAll:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          if (dispatch) {
            for (const m of [...s.matches].reverse()) tr.insertText(replacement, m.from, m.to);
            dispatch(tr.setMeta(searchKey, { current: 0 }));
          }
          return true;
        },
    };
  },
});
