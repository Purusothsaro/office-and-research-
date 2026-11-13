import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom does not implement object URLs; downloads only need them to exist.
URL.createObjectURL ??= () => "blob:test";
URL.revokeObjectURL ??= () => {};

// jsdom has no layout; ProseMirror needs these to exist when focusing and scrolling.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
const zeroRect = () => new DOMRect(0, 0, 0, 0);
for (const proto of [Range.prototype, Element.prototype] as unknown as { getClientRects?: () => DOMRectList; getBoundingClientRect?: () => DOMRect }[]) {
  proto.getClientRects ??= emptyRects;
  proto.getBoundingClientRect ??= zeroRect;
}
document.elementFromPoint ??= () => null;
