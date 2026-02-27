const API_BASE = "https://backend.jacobw-t212.workers.dev";

const statusEl = document.getElementById("status");
const baselineDateEl = document.getElementById("baselineDate");
const baselineCapturedEl = document.getElementById("baselineCaptured");
const totalPLEl = document.getElementById("totalPL");
const tbody = document.querySelector("#plTable tbody");
const refreshBtn = document.getElementById("refreshBtn");

function fmtMoney(value, currency = "GBP") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency
  }).format(value);
}

function fmtNumber(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 4
  }).format(value);
}

function fmtPct(value) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(2)}%`;
}

// Convert GBX → GBP
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
    const data = await res.json();

    baselineDateEl.textContent = data.baselineDate || "—";
    baselineCapturedEl.textContent = data.baselineCapturedAtIso || "—";

    // Calculate total portfolio value
    const portfolioTotal = data.rows.reduce(
      (sum, r) => sum + (r.currentValue ?? 0),
      0
    );

    // Green/red for total daily P/L
    let totalClass = "";
    if (data.totalValueChange > 0) totalClass = "positive";
    if (data.totalValueChange < 0) totalClass = "negative";

    totalPLEl.innerHTML = `
      <span class="${totalClass}">
        ${fmtMoney(data.totalValueChange, "GBP")}
      </span>
      <div class="small">
        Portfolio Value: ${fmtMoney(portfolioTotal, "GBP")}
      </div>
    `;

    tbody.innerHTML = "";

    for (const r of data.rows) {
      const tr = document.createElement("tr");

      const prevClose = normalizePrice(r.prevClosePrice, r.instrumentCurrency);
      const current = normalizePrice(r.currentPrice, r.instrumentCurrency);
      const priceDelta = normalizePrice(r.priceChange, r.instrumentCurrency);

      const allocationPct = portfolioTotal > 0
        ? (r.currentValue / portfolioTotal) * 100
        : 0;

      let plClass = "";
      if (r.valueChange > 0) plClass = "positive";
      if (r.valueChange < 0) plClass = "negative";

      tr.innerHTML = `
        <td>
          <div>${r.name}</div>
          <div class="small">${r.isin}</div>
        </td>

        <td>${r.ticker}</td>

        <td>${fmtNumber(r.quantity)}</td>

        <td>
          ${prevClose.value === null
            ? "—"
            : fmtMoney(prevClose.value, prevClose.currency)}
        </td>

        <td>
          ${fmtMoney(current.value, current.currency)}
        </td>

        <td>
          ${priceDelta.value === null
            ? "—"
            : fmtMoney(priceDelta.value, current.currency)}
        </td>

        <td>
          ${r.prevCloseValue === null
            ? "—"
            : fmtMoney(r.prevCloseValue, r.walletCurrency)}
        </td>

        <td>
          ${fmtMoney(r.currentValue, r.walletCurrency)}
        </td>

        <td class="${plClass}">
          ${r.valueChange === null
            ? "—"
            : `${fmtMoney(r.valueChange, r.walletCurrency)} (${fmtPct(r.valueChangePct)})`}
          <div class="small">${allocationPct.toFixed(2)}% of portfolio</div>
        </td>
      `;

      tbody.appendChild(tr);
    }

    statusEl.textContent = `Updated: ${new Date(data.asOf).toLocaleTimeString()}`;
  } catch (e) {
    statusEl.textContent = "Error loading data";
  }
}

refreshBtn.addEventListener("click", load);

load();
setInterval(load, 20 * 60 * 1000);