# Design System — Colour & Layout

A portable spec for the "anthracite / carbon / off-white" visual identity
used in Wealth Ledger, written so it can be dropped into another app (this
one or a different codebase) and produce the same look and feel. It covers
three layers: the **base UI palette** (chrome, text, backgrounds), the
**data palette** (charts, gains/losses, categorical series), and the
**layout conventions** (nav rail, cards, sticky headers, texture). Each
section gives the exact values plus *why*, so a future adopter can deviate
deliberately instead of by accident.

Built on [Fluent UI v9](https://react.fluentui.dev/) (`@fluentui/react-components`)
conventions — a `Theme` object plus per-component `makeStyles()` — but the
palette and layout rules themselves aren't Fluent-specific; the "porting to
a non-Fluent app" section at the end covers CSS custom properties instead.

---

## 1. Base UI palette

| Role | Name | Hex | Usage |
|---|---|---|---|
| Primary accent | Anthracite (RAL 7016) | `#2F3538` | Top navigation, primary buttons, headings, important outlines/borders. The identity's "signature" color. |
| Link / informational accent | Royal Blue | `#2563EB` | Hyperlinks, the nav's active-item highlight, single-line chart accents on informational/historical views. Kept separate from anthracite because anthracite-on-white doesn't read as clickable — a link needs its own, more conventional affordance. |
| Secondary text | Slate | `#5A656B` | Labels, captions, subtitles, inactive/disabled states. Softer than the primary anthracite but still AA-legible on white. |
| Page background | Off-white | `#F8F9FA` | The app's base canvas. Noticeably easier on the eyes over long sessions than pure white; also the *only* thing separating page from card, so cards read as "raised" without a heavy shadow. |
| Cards / containers | Pure white | `#FFFFFF` | Content cards, tables, modals — anything that should visibly sit *above* the page background. |
| Premium / VIP accent (reserved) | Champagne gold | `#C5A059` | Not a default-visible color — use sparingly, only for an explicit premium/exclusive signal (a "Private Banking" badge, a VIP-tier indicator). Skip entirely if the app has no such tier; don't force it in just because it's in the palette. |

**On-dark text**: never pure white (`#FFFFFF`) on the anthracite panels below —
it visibly *flickers* against a saturated dark background over any amount of
reading. Use a soft off-white instead:

| Role | Hex |
|---|---|
| Primary text on anthracite | `#F5F5F7` |
| Secondary text on anthracite | `#C7CBD1` |
| Tertiary / caption text on anthracite | `#868C94` |

**Contrast**: Anthracite (`#2F3538`) on white passes WCAG AAA for text
(>7:1). Royal Blue (`#2563EB`) on white passes AA for normal text, AAA for
large text — fine for links and headings, worth a second look if you ever
use it for small body copy.

### Dark mode

Anthracite itself nearly disappears against a dark app background — using
it as the accent in dark mode reads as "no accent at all." Lift the primary
accent to a lighter, still-desaturated neutral instead of just brightening
the same hue:

| Role | Light mode | Dark mode |
|---|---|---|
| Primary accent (buttons, headings) | `#2F3538` | `#94A3B8` ("Helles Anthrazit" — the data palette's own cash/liquidity slate, reused here) |
| Primary accent hover | `#262B2D` | `#B0BCC9` |
| Primary accent pressed | `#1D2122` | `#7C8896` |
| Link / informational accent | `#2563EB` | `#5B9BF5` (same hue, lifted for contrast) |

### Fluent UI theme object

```ts
import { webLightTheme, webDarkTheme, type Theme } from "@fluentui/react-components";

export const appTheme: Theme = {
  ...webLightTheme,
  colorBrandBackground: "#2F3538",
  colorBrandBackgroundHover: "#262B2D",
  colorBrandBackgroundPressed: "#1D2122",
  colorCompoundBrandBackground: "#2F3538",
  colorBrandForeground1: "#2F3538",
  colorBrandForegroundLink: "#2563EB",   // deliberately not the same as the brand background
  colorNeutralBackground1: "#FFFFFF",     // cards
  colorNeutralBackground2: "#F8F9FA",     // page
};

export const appThemeDark: Theme = {
  ...webDarkTheme,
  colorBrandBackground: "#94A3B8",
  colorBrandBackgroundHover: "#B0BCC9",
  colorBrandBackgroundPressed: "#7C8896",
  colorCompoundBrandBackground: "#94A3B8",
  colorBrandForeground1: "#94A3B8",
  colorBrandForegroundLink: "#5B9BF5",
};
```

Everything downstream of these tokens (primary buttons, focus rings, the
default link color, compound-button "brand" appearance) inherits
automatically — this is the *only* file most Fluent apps need to touch to
pick up the identity for their standard controls.

---

## 2. Data palette (charts, KPIs, categorical series)

A finance/wealth app's charts need real color — a grayscale-only chart
becomes unreadable the moment there are more than two series. This palette
gives exactly enough hue variety to stay legible without turning the UI
into a rainbow.

| Role | Name | Hex | Usage |
|---|---|---|---|
| Positive / gains | Emerald | `#10B981` | Any positive delta, success state, "on track" indicator. |
| Negative / losses | Red | `#EF4444` | Any negative delta, failure state, risk flag. |
| Informational line | Royal Blue | `#2563EB` | A single-series trend line on a historical/informational chart (net worth over time, an FX rate, a projection) — *not* itself a gain/loss signal. |
| Asset class 1 | Royal Blue | `#2563EB` | e.g. bonds, conservative holdings — "trustworthy." |
| Asset class 2 | Violet | `#7C3AED` | e.g. real estate — "substance." |
| Asset class 3 | Amber | `#F59E0B` | e.g. commodities, alternative investments. |
| Asset class 4 | Slate | `#94A3B8` | e.g. cash/liquidity — deliberately the *least* visually prominent color, since parked cash shouldn't visually compete with invested assets. |

### Categorical sets

For a multi-series chart (stacked bars, a donut, an allocation pie) build a
fixed-order array so the same category always gets the same color across
every chart in the app:

```
["#2F3538", "#2563EB", "#10B981", "#7C3AED", "#F59E0B", "#94A3B8"]
 anthracite  blue       green      violet     amber      slate
```

### Sequential ramps (heatmaps, magnitude scales)

A *sequential* scale (low→high spend, activity intensity) is a different
problem than a categorical one — it needs one hue, tinted light to dark, not
several hues. Use a single-hue ramp derived from the informational blue:

```
["#F1F5FE", "#D6E4FC", "#A8C5F8", "#6D9AF0", "#2563EB", "#1E3A8A"]
  lightest                                              darkest
```

Reusing the categorical set's six colors for a heatmap would read as
"category," not "intensity" — keep the two use cases visually distinct.

### What *not* to recolor

Two things deliberately don't come from this palette:

- **Confidence/severity ramps** (a Monte-Carlo simulation's P99→median bands,
  a risk-tier color scale with more than 2-3 steps) are their own semantic
  system — usually a red→amber→green gradient tied to statistical meaning,
  not to "which asset class is this." Leave them alone; recoloring them to
  match the categorical set would erase the severity signal.
- **Chart axes and gridlines** stay a neutral gray (Fluent's own
  `colorNeutralStroke2`/`#f0f0f0`-ish), not anthracite or blue — axes are
  structure, not data, and shouldn't compete with the marks plotted on them.

### Line-chart color rule

For a chart with one performance/trend line: use Royal Blue if the chart is
a historical or informational view (a balance over time, a rate history,
a projection). Only use green/red on that same line if the chart is
specifically communicating a live gain/loss state (rare — most trend charts
in a planning app are informational, not real-time P&L). Don't build
per-line "is this year up or down" conditional coloring unless the chart's
whole purpose is that comparison — it adds real complexity for a signal
the axis labels and a KPI tile usually already carry.

---

## 3. Layout conventions

### Nav rail / primary chrome

A left-hand (or top) navigation rail in the primary accent color
(anthracite) with:
- Off-white brand/title text (`#F5F5F7`), not pure white.
- Inactive nav items in a mid-tone light gray (`#C7CBD1`).
- The **active** item highlighted in the *informational* accent (Royal
  Blue), not a darker/lighter shade of the rail's own anthracite — if the
  rail and the highlight are the same hue family, the highlight becomes
  invisible. Cross-hue contrast (anthracite rail, blue highlight) is the
  point.
- A subtle "carbon fiber" texture (see below) on large anthracite panels,
  not a flat fill — turns "looks like a plain dark rectangle" into
  "looks like a deliberately chosen material."

### Cards on an off-white canvas

Page background off-white (`#F8F9FA`), every card/table/modal pure white
(`#FFFFFF`) with a light border or a small shadow. The off-white/white pair
does most of the "this is a card" work by itself — a heavy drop shadow
usually isn't necessary on top of it.

### Carbon-fiber texture

A two-layer diagonal `repeating-linear-gradient`, applied as a
`background-image` on top of the flat anthracite `background-color`. Subtle
by design — visible as "textured material" up close, reads as flat
anthracite from a normal viewing distance:

```css
background-color: #2F3538;
background-image:
  repeating-linear-gradient(45deg,  rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 4px),
  repeating-linear-gradient(-45deg, rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 4px);
```

Reserve it for genuinely large anthracite surfaces — a nav rail, a hero
band, a report cover. Skip it on small elements (buttons, thin toolbars,
badges); at that size the pattern reads as noise rather than texture. The
opacity (`0.035`) is deliberately low — raise it a little (up to ~0.06) if
the surface is very large and the weave needs to read at a glance, but stay
well short of anything that competes with the text sitting on top of it.

### Sticky table chrome

For a wide data table that scrolls both directions inside a bounded box:
- `position: sticky; top: 0` on the header row, with an explicit background
  color (`colorNeutralBackground1`) so scrolling content doesn't show
  through.
- `position: sticky; left: 0` on the first (label) column's cells, same
  background-color rule.
- The cell that's sticky on *both* axes (the header row's first cell) needs
  a higher `z-index` than the plain single-axis sticky cells, or it gets
  visually covered by whichever one scrolls under it last.
- If the table library renders `table-layout: fixed` (Fluent's `<Table>`
  does), column width has to be set as an explicit `width` on the **header
  row's** cells specifically — `min-width`, and any width set on body-row
  cells, are both ignored by that layout algorithm. This is an easy trap:
  setting `min-width` everywhere *looks* right in the JSX and does nothing
  visible.

### 60-30-10 balance

As a rough budget across any one screen: ~60% of the visible area should be
the off-white/white background-and-cards pairing, ~30% structural
anthracite (nav, headings, borders), and at most ~10% the colorful
data/accent palette (chart marks, the blue link/highlight color, status
colors). If a screen's chart alone is pulling more than that ~10%, it
usually means too many categorical colors are fighting for attention at
once — collapse some categories, or move to a sequential ramp if the data
is actually a magnitude, not a category.

---

## 4. Porting to a non-Fluent app

The palette and layout rules above don't depend on Fluent UI — only §1's
"Fluent UI theme object" code block does. For a plain CSS / Tailwind / any
other stack, define the same values as custom properties instead:

```css
:root {
  --accent: #2F3538;
  --accent-hover: #262B2D;
  --accent-pressed: #1D2122;
  --link: #2563EB;
  --text-secondary: #5A656B;
  --bg-page: #F8F9FA;
  --bg-card: #FFFFFF;
  --on-dark-primary: #F5F5F7;
  --on-dark-secondary: #C7CBD1;
  --on-dark-tertiary: #868C94;

  --data-positive: #10B981;
  --data-negative: #EF4444;
  --data-blue: #2563EB;
  --data-violet: #7C3AED;
  --data-amber: #F59E0B;
  --data-slate: #94A3B8;
}

[data-theme="dark"] {
  --accent: #94A3B8;
  --accent-hover: #B0BCC9;
  --accent-pressed: #7C8896;
  --link: #5B9BF5;
}
```

Everything else — the categorical/sequential chart arrays, the carbon
texture snippet, the sticky-table rules, the 60-30-10 guidance — copies
over verbatim; none of it is framework-specific.
