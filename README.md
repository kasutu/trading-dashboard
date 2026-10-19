# Trade Journal

Trading performance dashboard. Vite + React + TypeScript + Tailwind v4 + shadcn/ui (slate) + Recharts.

```bash
npm install
npm run dev      # http://localhost:5173
```

Upload a CSV export (Exness / MT5 columns: `ticket, opening_time_utc, closing_time_utc, type, lots, symbol,
opening_price, closing_price, stop_loss, take_profit, commission, swap, profit, close_reason`).
Data stays in the browser (last upload is remembered in localStorage).

- `src/lib/trades.ts` – CSV parsing and all the analysis (groupings, simulators)
- `src/components/dash/insights.ts` – auto-generated insights
- `src/components/dash/charts.tsx` – chart components
- `src/App.tsx` – layout, filters, tabs
