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
  if (!marketStatusEl) return;

  // Create a Date object representing current London time
  const londonNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/London" })
  );

  const day = londonNow.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
  const hour = londonNow.getHours();
  const minute = londonNow.getMinutes();

  const totalMinutes = hour * 60 + minute;
  const isWeekday = day >= 1 && day <= 5;

  const marketOpenMinutes = 8 * 60;        // 08:00 London
  const marketCloseMinutes = 16 * 60 + 30; // 16:30 London

  const isOpen =
    isWeekday &&
    totalMinutes >= marketOpenMinutes &&
    totalMinutes < marketCloseMinutes;

  marketStatusEl.textContent = isOpen
    ? "Market Open (LSE hours)"
    : "Market Closed";

  marketStatusEl.className = isOpen
    ? "market-status market-open"
    : "market-status market-closed";
}

async function load() {
  statusEl.textContent = "Refreshing…";

  try {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    const data = await res.json();

    baselineDateEl.textContent = data.baselineDate || "—";
    baselineCapturedEl.textContent = data.baselineCapturedAtIso || "—";

    const portfolioTotal = data.rows.reduce(
      (sum, r) => sum + (r.currentValue ?? 0),
      0
    );

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
    updateMarketStatus();
  } catch (e) {
    statusEl.textContent = "Error loading data";
  }
}

if (themeToggle) {
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark");
    themeToggle.checked = true;
  }

  themeToggle.addEventListener("change", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("darkMode", themeToggle.checked);
    updateMarketStatus();
  });
}

refreshBtn.addEventListener("click", load);

load();
setInterval(load, 20 * 60 * 1000);
setInterval(updateMarketStatus, 60 * 1000);