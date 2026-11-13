/**
 * Pure page-layout calculation. The editor measures each top-level block
 * and this function decides where pages break. Blocks are not split, so a
 * block taller than the remaining space moves to the next page, and a block
 * taller than a whole page makes that page grow.
 */

export interface BlockMetrics {
  height: number;
  /** Heights of footnotes referenced inside the block, in order. */
  footnoteHeights: number[];
  /** A manual page break: the page ends after this block. */
  pageBreak: boolean;
}

export interface PageLayout {
  /** Index of the first block on each page. Page 1 always starts at 0. */
  pageStarts: number[];
  /** Unused content space at the bottom of each page (never negative). */
  slack: number[];
  /** Footnote-area height reserved on each page. */
  footnoteArea: number[];
  /** Block index ranges [start, end) of each page. */
  ranges: [number, number][];
}

export const FOOTNOTE_SEPARATOR = 14;

export function layoutPages(blocks: BlockMetrics[], contentHeight: number): PageLayout {
  const pageStarts = [0];
  const slack: number[] = [];
  const footnoteArea: number[] = [];
  let used = 0;
  let notes = 0;

  const closePage = (nextStart: number) => {
    slack.push(Math.max(0, contentHeight - used - notes));
    footnoteArea.push(notes);
    pageStarts.push(nextStart);
    used = 0;
    notes = 0;
  };

  blocks.forEach((block, i) => {
    const blockNotes = block.footnoteHeights.reduce((a, b) => a + b, 0);
    // The first footnote on a page also needs the separator line.
    const noteCost = (pageNotes: number) => (blockNotes > 0 && pageNotes === 0 ? blockNotes + FOOTNOTE_SEPARATOR : blockNotes);
    if (used > 0 && used + block.height + notes + noteCost(notes) > contentHeight) closePage(i);
    used += block.height;
    notes += noteCost(notes);
    if (block.pageBreak && i < blocks.length - 1) closePage(i + 1);
  });
  slack.push(Math.max(0, contentHeight - used - notes));
  footnoteArea.push(notes);

  const ranges = pageStarts.map((start, p) => [start, pageStarts[p + 1] ?? blocks.length] as [number, number]);
  return { pageStarts, slack, footnoteArea, ranges };
}
