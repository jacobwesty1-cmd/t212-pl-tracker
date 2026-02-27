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

// ✅ NEW: Convert GBX → GBP for display only
function normalizePrice(value, currency) {
  if (value === null || value === undefined) return { value: null, currency };

  if (currency === "GBX") {
    return {
      value: value / 100,
      currency: "GBP"
    };
  }

  return { value, currency };
}

async function load() {
  statusEl.textContent = "Refreshing…";

  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();

    baselineDateEl.textContent = data.baselineDate || "— (no baseline yet)";
    baselineCapturedEl.textContent = data.baselineCapturedAtIso || "—";

    const currency = data.rows?.[0]?.walletCurrency || "GBP";
    totalPLEl.textContent = fmtMoney(data.totalValueChange, currency);

    tbody.innerHTML = "";

    for (const r of data.rows) {
      const tr = document.createElement("tr");

      // Normalize prices
      const prevClose = normalizePrice(r.prevClosePrice, r.instrumentCurrency);
      const current = normalizePrice(r.currentPrice, r.instrumentCurrency);
      const priceDelta = normalizePrice(r.priceChange, r.instrumentCurrency);

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

        <td>
          ${
            prevClose.value === null
              ? "—"
              : `${fmtNumber(prevClose.value)} <span class="small">${prevClose.currency}</span>`
          }
        </td>

        <td>
          ${fmtNumber(current.value)} 
          <span class="small">${current.currency}</span>
        </td>

        <td>
          ${
            priceDelta.value === null
              ? "—"
              : `${fmtNumber(priceDelta.value)} (${fmtPct(r.priceChangePct)})`
          }
        </td>

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

load();
setInterval(load, 20 * 60 * 1000);