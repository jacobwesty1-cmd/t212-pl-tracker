export interface Env {
  T212_API_KEY: string;
  T212_API_SECRET: string;
  T212_ENV?: string; // "live" | "demo"
  SNAPSHOTS: KVNamespace;
}

type T212Position = {
  currentPrice: number;
  averagePricePaid: number;
  quantity: number;
  instrument: {
    name: string;
    ticker: string;
    isin: string;
    currency: string;
  };
  walletImpact: {
    currency: string; // usually your account currency (e.g., GBP)
    currentValue: number;
    totalCost: number;
    unrealizedProfitLoss: number;
    fxImpact: number;
  };
};

type CloseSnapshot = {
  capturedAtIso: string; // ISO timestamp of when we captured it
  londonDate: string;    // YYYY-MM-DD in Europe/London
  positions: Array<{
    ticker: string;
    isin: string;
    name: string;
    instrumentCurrency: string;
    walletCurrency: string;
    quantity: number;
    closePrice: number; // "currentPrice" at snapshot time
    closeValue: number; // walletImpact.currentValue at snapshot time
  }>;
};

const T212_BASE: Record<string, string> = {
  live: "https://live.trading212.com",
  demo: "https://demo.trading212.com",
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  // CORS: allow your Pages site (and any browser) to call the API
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");

  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function londonDateKey(date: Date): string {
  // en-CA gives YYYY-MM-DD format
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function londonHour(date: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number.parseInt(h, 10);
}

function getBaseUrl(env: Env): string {
  const mode = (env.T212_ENV || "live").toLowerCase();
  return T212_BASE[mode] || T212_BASE.live;
}

function authHeader(env: Env): string {
  // Trading212 uses HTTP Basic Auth: API_KEY:API_SECRET
  const encoded = btoa(`${env.T212_API_KEY}:${env.T212_API_SECRET}`);
  return `Basic ${encoded}`;
}

async function fetchPositions(env: Env): Promise<T212Position[]> {
  const res = await fetch(`${getBaseUrl(env)}/api/v0/equity/positions`, {
    headers: {
      Authorization: authHeader(env),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trading212 /positions failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T212Position[];
}

function buildSnapshot(positions: T212Position[], capturedAt: Date): CloseSnapshot {
  const londonDate = londonDateKey(capturedAt);
  return {
    capturedAtIso: capturedAt.toISOString(),
    londonDate,
    positions: positions.map((p) => ({
      ticker: p.instrument.ticker,
      isin: p.instrument.isin,
      name: p.instrument.name,
      instrumentCurrency: p.instrument.currency,
      walletCurrency: p.walletImpact.currency,
      quantity: p.quantity,
      closePrice: p.currentPrice,
      closeValue: p.walletImpact.currentValue,
    })),
  };
}

async function getIndex(env: Env): Promise<string[]> {
  const raw = await env.SNAPSHOTS.get("close:index");
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function putIndex(env: Env, dates: string[]): Promise<void> {
  // keep sorted, unique, capped
  const unique = Array.from(new Set(dates)).sort();
  const capped = unique.slice(-500);
  await env.SNAPSHOTS.put("close:index", JSON.stringify(capped));
}

async function storeCloseSnapshotIfNeeded(
  env: Env,
  scheduledTime: Date
): Promise<{ stored: boolean; reason: string; londonDate?: string }> {
  // Only store at 18:xx London time.
  const hr = londonHour(scheduledTime);
  if (hr !== 18) return { stored: false, reason: `Skip: London hour is ${hr}, not 18` };

  const todayLondon = londonDateKey(scheduledTime);

  // Idempotent: don't store twice for same London date
  const already = await env.SNAPSHOTS.get(`close:${todayLondon}`);
  if (already) return { stored: false, reason: `Skip: snapshot already exists for ${todayLondon}`, londonDate: todayLondon };

  const positions = await fetchPositions(env);
  const snapshot = buildSnapshot(positions, scheduledTime);

  await env.SNAPSHOTS.put(`close:${todayLondon}`, JSON.stringify(snapshot));

  const index = await getIndex(env);
  index.push(todayLondon);
  await putIndex(env, index);

  return { stored: true, reason: `Stored snapshot for ${todayLondon}`, londonDate: todayLondon };
}

function findPreviousCloseDate(index: string[], todayLondon: string): string | null {
  // index is sorted YYYY-MM-DD
  // pick the last date strictly < todayLondon
  for (let i = index.length - 1; i >= 0; i--) {
    if (index[i] < todayLondon) return index[i];
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, time: new Date().toISOString() });
      }

      if (url.pathname === "/api/live-positions") {
        const positions = await fetchPositions(env);
        return json({ asOf: new Date().toISOString(), positions });
      }

      if (url.pathname === "/api/close/index") {
        const index = await getIndex(env);
        return json({ index });
      }

      if (url.pathname === "/api/close/by-date") {
        const date = url.searchParams.get("date");
        if (!date) return json({ error: "Missing ?date=YYYY-MM-DD" }, { status: 400 });

        const raw = await env.SNAPSHOTS.get(`close:${date}`);
        if (!raw) return json({ error: `No snapshot for ${date}` }, { status: 404 });

        return json(JSON.parse(raw));
      }

      // Seed baseline immediately (so you don’t need to wait for the first weekday snapshot)
      // This stores a snapshot under "yesterday" London date using *current* prices.
      // It's not a true market close, but it gives you an immediate baseline for today.
      if (url.pathname === "/api/admin/seed-yesterday") {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayLondon = londonDateKey(yesterday);

        const exists = await env.SNAPSHOTS.get(`close:${yesterdayLondon}`);
        if (exists) {
          return json({ ok: true, message: `Snapshot already exists for ${yesterdayLondon}. Not overwriting.` });
        }

        const positions = await fetchPositions(env);
        const snapshotNow = buildSnapshot(positions, now);

        const snapshotToStore: CloseSnapshot = {
          ...snapshotNow,
          londonDate: yesterdayLondon,
        };

        await env.SNAPSHOTS.put(`close:${yesterdayLondon}`, JSON.stringify(snapshotToStore));

        const index = await getIndex(env);
        index.push(yesterdayLondon);
        await putIndex(env, index);

        return json({ ok: true, message: `Seeded baseline snapshot under ${yesterdayLondon}.` });
      }

      if (url.pathname === "/api/dashboard") {
        const now = new Date();
        const todayLondon = londonDateKey(now);

        const index = await getIndex(env);
        const baselineDate = findPreviousCloseDate(index, todayLondon);

        const live = await fetchPositions(env);

        let baseline: CloseSnapshot | null = null;
        if (baselineDate) {
          const raw = await env.SNAPSHOTS.get(`close:${baselineDate}`);
          if (raw) baseline = JSON.parse(raw) as CloseSnapshot;
        }

        // Use ISIN as the join key (more stable than ticker)
        const baselineMap = new Map<string, CloseSnapshot["positions"][number]>();
        if (baseline) {
          for (const p of baseline.positions) baselineMap.set(p.isin, p);
        }

        const rows = live.map((p) => {
          const b = baselineMap.get(p.instrument.isin);

          const currentPrice = p.currentPrice;
          const prevClosePrice = b?.closePrice ?? null;

          const currentValue = p.walletImpact.currentValue;
          const prevCloseValue = b?.closeValue ?? null;

          const priceChange =
            prevClosePrice === null ? null : currentPrice - prevClosePrice;

          const priceChangePct =
            prevClosePrice === null || prevClosePrice === 0
              ? null
              : (priceChange! / prevClosePrice) * 100;

          const valueChange =
            prevCloseValue === null ? null : currentValue - prevCloseValue;

          const valueChangePct =
            prevCloseValue === null || prevCloseValue === 0
              ? null
              : (valueChange! / prevCloseValue) * 100;

          return {
            name: p.instrument.name,
            ticker: p.instrument.ticker,
            isin: p.instrument.isin,
            instrumentCurrency: p.instrument.currency,
            walletCurrency: p.walletImpact.currency,
            quantity: p.quantity,

            prevClosePrice,
            currentPrice,
            priceChange,
            priceChangePct,

            prevCloseValue,
            currentValue,
            valueChange,
            valueChangePct,
          };
        });

        rows.sort((a, b) => b.currentValue - a.currentValue);
        
        const totalValueChange = rows.reduce((sum, r) => sum + (r.valueChange ?? 0), 0);

        return json({
          asOf: now.toISOString(),
          todayLondon,
          baselineDate,
          baselineCapturedAtIso: baseline?.capturedAtIso ?? null,
          totalValueChange,
          rows,
        });
      }

      return json({ error: "Not found" }, { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, { status: 500 });
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // controller.scheduledTime is milliseconds since epoch (UTC)
    const scheduledTime = new Date(controller.scheduledTime);

    ctx.waitUntil(
      (async () => {
        const result = await storeCloseSnapshotIfNeeded(env, scheduledTime);
        console.log(`[snapshot] ${result.reason}`);
      })()
    );
  },
};