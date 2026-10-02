export type DropdownPanelAlignOptions = {
  /** Larghezza uguale al trigger (select). */
  matchAnchorWidth?: boolean;
  minWidth?: number;
  maxWidth?: number;
};

export function syncFixedDropdownPanel(
  host: HTMLElement,
  anchorSelector: string,
  options: DropdownPanelAlignOptions = {},
): Record<string, string> {
  const anchor = host.querySelector(anchorSelector) as HTMLElement | null;
  if (!anchor) {
    return {};
  }

  const rect = anchor.getBoundingClientRect();
  const minWidth = options.minWidth ?? 240;
  const maxWidth = options.maxWidth ?? 420;
  const width = options.matchAnchorWidth
    ? rect.width
    : Math.min(Math.max(rect.width, minWidth), maxWidth);

  let left = rect.left;
  const maxLeft = window.innerWidth - width - 8;
  if (left > maxLeft) {
    left = Math.max(8, maxLeft);
  }

  return {
    top: `${rect.bottom + 4}px`,
    left: `${left}px`,
    width: `${width}px`,
  };
}
