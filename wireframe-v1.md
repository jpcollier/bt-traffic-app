# MTA Bridges & Tunnels Command Center — Wireframe v1

> Scope note: This design is for **hourly data published in batches** (weekly now, daily possible later), not real-time operations.

## Global Layout (all pages)

- **Header bar**
  - Title: `MTA B&T Command Center`
  - Subtitle badge: `Not real-time • Refreshed: [timestamp] • Data through: [timestamp]`
  - Date selector: `Latest full week` (default), `Latest full day`, custom range
  - Filters: Facility, Direction, Vehicle Class, Payment Type
- **Left nav**
  - 1) Executive Command View
  - 2) Facility Comparison
  - 3) Facility Detail
  - 4) Payment Monitor
- **Footer ribbon**
  - Data completeness %
  - Missing records count
  - Last pipeline run status

---

## Page 1 — Executive Command View

## Goal
Give executives a 30–60 second snapshot of trend health and biggest changes.

## Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER: MTA B&T Command Center | Not real-time | Refreshed ...             │
├──────────────────────────────────────────────────────────────────────────────┤
│ KPI1 Total Crossings │ KPI2 WoW % │ KPI3 YoY % │ KPI4 E-ZPass % │ KPI5 TBM%│
│ KPI6 Top Mover       │ KPI7 Biggest Drop       │ KPI8 Data Through           │
├───────────────────────────────────────┬──────────────────────────────────────┤
│ A) Weekly Trend (104 weeks)           │ B) WoW / YoY Delta (last 16 weeks)  │
│ - current week line                   │ - grouped bars: WoW, YoY            │
│ - prior-year same-week overlay        │ - color by direction of change       │
├───────────────────────────────────────┴──────────────────────────────────────┤
│ C) Biggest Facility Movers (table)                                         │
│ Facility | Latest Week Vol | WoW % | YoY % | Abs Δ YoY | EZP share | TBM   │
│ default sort: absolute YoY decline (toggle gainers/decliners)              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Interactions
- Click facility row → opens Page 3 filtered to that facility.
- Toggle `View`: absolute delta vs percent delta movers.
- Tooltips include denominator period and exact dates.

---

## Page 2 — Facility Comparison

## Goal
Identify which facilities changed most and whether changes are meaningful by scale.

## Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER + GLOBAL FILTERS                                                     │
├─────────────────────────────────────────┬────────────────────────────────────┤
│ A) Bubble Scatter                       │ B) Facility Heatmap                │
│ X: YoY %                                │ Rows: Facilities                   │
│ Y: WoW %                                │ Cols: YoY, WoW, EZP pp, AM pp, Dir │
│ Bubble size: Latest week volume         │ Color: deviation intensity         │
├─────────────────────────────────────────┴────────────────────────────────────┤
│ C) Auto Callouts                                                           │
│ - "[Facility] down X% YoY; drop concentrated in weekday AM inbound"       │
│ - "[Facility] up X% YoY; gain driven by PM outbound passenger vehicles"   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Interactions
- Lasso/point click in scatter filters heatmap + callouts.
- “Only major movers” toggle (minimum volume threshold).

---

## Page 3 — Facility Detail

## Goal
Answer: **“Traffic at X facility is down X% YoY — why?”**

## Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER + FACILITY SELECTOR: [Facility X]                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ KPI Row: Latest Week Vol | YoY % (Abs Δ) | WoW % | EZP% (pp YoY) | TBM%     │
├─────────────────────────────────────────┬────────────────────────────────────┤
│ A) Weekly Volume Trend (2 years)        │ B) Week-of-Year YoY Comparison     │
│ - line + moving average                 │ - current year vs previous year     │
├─────────────────────────────────────────┴────────────────────────────────────┤
│ C) Mix & Pattern Decomposition                                               │
│ C1 Vehicle Class Mix: current vs prior year                                 │
│ C2 Time-of-Day Profile: AM/PM/off-peak shares (YoY pp)                      │
│ C3 Direction Split: inbound vs outbound share (WoW/YoY pp)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ D) Change Drivers Table                                                     │
│ Dimension | Current | Prior | Δ Abs | Δ % | Contribution to total change %  │
│ (vehicle class, time bucket, direction, payment type)                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Interactions
- “Explain change” button auto-expands top 3 contributors.
- Date range switch (latest week default; optional day view).

---

## Page 4 — Payment Monitor (E-ZPass vs Tolls by Mail)

## Goal
Track channel shift systemwide and by facility.

## Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER + FILTERS                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ KPI: EZP Share | EZP YoY pp | TBM Share | TBM YoY pp | Largest shift fac    │
├─────────────────────────────────────────┬────────────────────────────────────┤
│ A) 100% Stacked Weekly Bars             │ B) Facility Small Multiples        │
│ EZP vs TBM share over time              │ EZP share trend per facility       │
├─────────────────────────────────────────┴────────────────────────────────────┤
│ C) Payment Shift Table                                                      │
│ Facility | EZP % | TBM % | EZP YoY pp | EZP WoW pp | Vol impacted           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Interactions
- Sort by YoY pp shift or total impacted volume.
- Drill from table row to Facility Detail (Page 3).

---

## Version 1 Defaults / Rules

1. **Default period:** Latest full week.
2. **Comparison baselines:**
   - WoW = prior full week.
   - YoY = same ISO week prior year.
3. **Display convention:**
   - `%` for relative change.
   - `pp` for share-point change.
4. **Data freshness:** Always visible in header badge.
5. **No “live” terminology:** use `Latest available` language only.

---

## Minimal v1 Build Checklist

- [ ] Global filters + refresh metadata badge
- [ ] Executive KPIs + system trend + movers table
- [ ] Facility comparison scatter + heatmap
- [ ] Facility detail decomposition
- [ ] Payment monitor
- [ ] CSV export on each table
- [ ] Consistent tooltips with explicit date windows

