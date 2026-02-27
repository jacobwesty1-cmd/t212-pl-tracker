// Replace with your deployed Worker URL:
const API_BASE = "https://backend.jacobw-t212.workers.dev";

const statusEl = document.getElementById("status");
const baselineDateEl = document.getElementById("baselineDate");
const baselineCapturedEl = document.getElementById("baselineCaptured");
const totalPLEl = document.getElementById("totalPL");
const tbody = document.querySelector("#plTable tbody");
const refreshBtn = document.getElementById("refreshBtn");
const seedBtn = document.getElementById("seedBtn");

function fmtMoney(value, currency) {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
  } catch {
    // fallback if currency code is unexpected
    return `${value.toFixed(2)} ${currency || ""}`.trim();
  }
}

function fmtNumber(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 6 }).format(value);
}

function fmtPct(value) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(2)}%`;
}

async function load() {
  statusEl.textContent = "Refreshing…";

  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();

    baselineDateEl.textContent = data.baselineDate || "— (no baseline yet)";
    baselineCapturedEl.textContent = data.baselineCapturedAtIso || "—";

    // Pick wallet currency from first row if present (usually GBP)
    const currency = data.rows?.[0]?.walletCurrency || "GBP";
    totalPLEl.textContent = fmtMoney(data.totalValueChange, currency);

    tbody.innerHTML = "";

    for (const r of data.rows) {
      const tr = document.createElement("tr");

      const dailyPLText = r.valueChange === null
        ? "—"
        : `${fmtMoney(r.valueChange, r.walletCurrency)} (${fmtPct(r.valueChangePct)})`;

      tr.innerHTML = `
        <td>
          <div>${r.name}</div>
          <div class="small">${r.isin}</div>
        </td>
        <td>${r.ticker}</td>
        <td>${fmtNumber(r.quantity)}</td>
        <td>${r.prevClosePrice === null ? "—" : `${fmtNumber(r.prevClosePrice)} <span class="small">${r.instrumentCurrency}</span>`}</td>
        <td>${fmtNumber(r.currentPrice)} <span class="small">${r.instrumentCurrency}</span></td>
        <td>${r.priceChange === null ? "—" : `${fmtNumber(r.priceChange)} (${fmtPct(r.priceChangePct)})`}</td>
        <td>${r.prevCloseValue === null ? "—" : fmtMoney(r.prevCloseValue, r.walletCurrency)}</td>
        <td>${fmtMoney(r.currentValue, r.walletCurrency)}</td>
        <td>${dailyPLText}</td>
      `;

      tbody.appendChild(tr);
    }

    statusEl.textContent = `Last updated: ${new Date(data.asOf).toLocaleString()}`;
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
}

refreshBtn.addEventListener("click", load);

seedBtn.addEventListener("click", async () => {
  statusEl.textContent = "Seeding baseline…";
  try {
    const res = await fetch(`${API_BASE}/api/admin/seed-yesterday`);
    const data = await res.json();
    statusEl.textContent = data.message || "Seeded. Refreshing…";
    await load();
  } catch (e) {
    statusEl.textContent = `Seed failed: ${e.message}`;
  }
});

// Load on open
load();

// Auto-refresh while open (20 mins). Change to 30*60*1000 if you prefer 30 mins.
setInterval(load, 20 * 60 * 1000);