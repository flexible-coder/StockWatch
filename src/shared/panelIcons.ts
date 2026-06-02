import { defineComponent, h } from "vue";

const createIcon = (paths: string[]) =>
  defineComponent({
    name: "PanelIcon",
    render() {
      return h(
        "svg",
        {
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 2,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "aria-hidden": "true",
        },
        paths.map((d) => h("path", { d })),
      );
    },
  });

export const SearchIcon = createIcon([
  "M21 21l-4.35-4.35",
  "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
]);

export const RefreshIcon = createIcon([
  "M20 6v6h-6",
  "M4 18v-6h6",
  "M19 12a7 7 0 0 0-12-5",
  "M5 12a7 7 0 0 0 12 5",
]);

export const SettingsIcon = createIcon([
  "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.1.4.72 1 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z",
]);

export const StarIcon = createIcon([
  "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21.02 7 14.14 2 9.27l6.91-1.01L12 2Z",
]);

export const LineChartIcon = createIcon(["M3 17l6-6 4 4 8-8", "M14 7h7v7"]);

export const BarChartIcon = createIcon(["M4 20V10", "M12 20V4", "M20 20v-7"]);

export const ReadIcon = createIcon([
  "M6 4h11a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z",
  "M7 16h12",
  "M8 8h7",
  "M8 12h9",
]);

export const BellIcon = createIcon([
  "M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z",
  "M10 21h4",
]);

export const ArrowLeftIcon = createIcon(["M19 12H5", "m12 19-7-7 7-7"]);

export const DeleteIcon = createIcon([
  "M3 6h18",
  "M8 6V4h8v2",
  "M6 6l1 16h10l1-16",
  "M10 11v6",
  "M14 11v6",
]);

export const PinIcon = createIcon([
  "M12 17v5",
  "M8 3h8l-1 7 3 3v2H6v-2l3-3-1-7Z",
]);
