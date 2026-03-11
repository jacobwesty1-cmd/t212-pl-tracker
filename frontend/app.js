const API_BASE = "https://backend.jacobw-t212.workers.dev";

const statusEl = document.getElementById("status");
const baselineDateEl = document.getElementById("baselineDate");
const baselineCapturedEl = document.getElementById("baselineCaptured");
const totalPLEl = document.getElementById("totalPL");
const tbody = document.querySelector("#plTable tbody");
const refreshBtn = document.getElementById("refreshBtn");
const themeToggle = document.getElementById("themeToggle");
const marketStatusEl = document.getElementById("marketStatus");

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
function updateMarketStatus() {
  const now = new Date();

  // Get London time
  const london = new Date(
    now.toLocaleString("en-GB", { timeZone: "Europe/London" })
  );

  const day = london.getDay(); // 0=Sun, 6=Sat
  const hour = london.getHours();
  const minutes = london.getMinutes();
  const totalMinutes = hour * 60 + minutes;

  const marketOpenMinutes = 8 * 60;        // 08:00
  const marketCloseMinutes = 16 * 60 + 30; // 16:30

  const isWeekday = day >= 1 && day <= 5;
  const isOpen =
    isWeekday &&
    totalMinutes >= marketOpenMinutes &&
    totalMinutes <= marketCloseMinutes;

  if (!marketStatusEl) return;

  if (isOpen) {
    marketStatusEl.textContent = "Market Open";
    marketStatusEl.className = "market-status market-open";
  } else {
    marketStatusEl.textContent = "Market Closed";
    marketStatusEl.className = "market-status market-closed";
  }
}

async function load() {
  statusEl.textContent = "Refreshing…";

  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    const data = await res.json();

    baselineDateEl.textContent = data.baselineDate || "—";
    baselineCapturedEl.textContent = data.baselineCapturedAtIso || "—";

    // Portfolio total value
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
          <div class="small">
            ${allocationPct.toFixed(2)}% of portfolio
          </div>
        </td>

        <td class="${plClass}">
          ${r.valueChange === null
            ? "—"
            : fmtMoney(r.valueChange, r.walletCurrency)}
        </td>
      `;

      tbody.appendChild(tr);
    }

    statusEl.textContent = `Updated: ${new Date(data.asOf).toLocaleTimeString()}`;
  } catch (e) {
    statusEl.textContent = "Error loading data";
  }
}

// Load saved preference
if (localStorage.getItem("darkMode") === "true") {
  document.body.classList.add("dark");
  themeToggle.checked = true;
}

themeToggle.addEventListener("change", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("darkMode", themeToggle.checked);
});

refreshBtn.addEventListener("click", load);

load();
setInterval(load, 20 * 60 * 1000);

updateMarketStatus();
setInterval(updateMarketStatus, 60 * 1000); // update every minute