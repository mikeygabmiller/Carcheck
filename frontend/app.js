// ============================================================================
// Second Opinion — frontend logic
// UPDATE API_URL with your Deno Deploy URL after first deploy
// ============================================================================

const API_URL = "https://YOUR-APP-NAME.deno.net";

// View elements
const inputView = document.getElementById("input-view");
const loadingView = document.getElementById("loading-view");
const resultView = document.getElementById("result-view");
const errorView = document.getElementById("error-view");

// Form elements
const form = document.getElementById("check-form");
const submitBtn = document.getElementById("submit-btn");
const listingInput = document.getElementById("listing");
const priceInput = document.getElementById("price");
const vinInput = document.getElementById("vin");

// Result elements
const verdictValue = document.getElementById("verdict-value");
const verdictSubject = document.getElementById("verdict-subject");
const statGrid = document.getElementById("stat-grid");
const priorOffensesList = document.getElementById("prior-offenses-list");
const mikeyNoteText = document.getElementById("mikey-note-text");
const sourcesEl = document.getElementById("sources");

// Buttons
const backBtn = document.getElementById("back-btn");
const errorBackBtn = document.getElementById("error-back-btn");
const errorText = document.getElementById("error-text");

// View switching
function showView(view) {
  [inputView, loadingView, resultView, errorView].forEach((v) => v.classList.add("hidden"));
  view.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Submit handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const listing = listingInput.value.trim();
  const price = priceInput.value.trim();
  const vin = vinInput.value.trim().toUpperCase();

  if (!listing || !price) return;

  submitBtn.disabled = true;
  showView(loadingView);

  try {
    const payload = { listing, price: Number(price) };
    if (vin.length === 17) payload.vin = vin;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Server error");
    }

    renderReport(data);
    showView(resultView);
  } catch (err) {
    errorText.textContent = err.message || "Network problem. Try again.";
    showView(errorView);
  } finally {
    submitBtn.disabled = false;
  }
});

// Back buttons
backBtn.addEventListener("click", () => {
  form.reset();
  showView(inputView);
});
errorBackBtn.addEventListener("click", () => showView(inputView));

// Render report
function renderReport(report) {
  // Verdict
  const verdictText = report.verdict || "INSPECT FIRST";
  verdictValue.textContent = verdictText;
  verdictValue.className = "verdict-value " + verdictClass(verdictText);
  verdictSubject.textContent = report.subject || "Unknown vehicle";

  // Stats grid (4 cards)
  statGrid.innerHTML = "";
  statGrid.appendChild(makeStat(
    "PRICE VS MARKET",
    formatPrice(report.asking_price),
    `${report.market_value?.delta_text || "—"} (est. $${(report.market_value?.estimate || 0).toLocaleString()})`,
    report.market_value?.delta_class
  ));
  statGrid.appendChild(makeStat(
    "RELIABILITY",
    report.reliability?.score || "—",
    report.reliability?.detail || "",
    report.reliability?.class
  ));
  statGrid.appendChild(makeStat(
    "SCAM RISK",
    report.scam_risk?.level || "—",
    report.scam_risk?.detail || "",
    report.scam_risk?.class
  ));
  statGrid.appendChild(makeStat(
    "FIRST CAR?",
    report.first_car?.verdict || "—",
    report.first_car?.detail || "",
    report.first_car?.class
  ));

  // Prior offenses
  priorOffensesList.innerHTML = "";
  (report.prior_offenses || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    priorOffensesList.appendChild(li);
  });

  // Mikey note
  mikeyNoteText.textContent = report.mikey_note || "";

  // Sources
  if (report.sources && report.sources.length > 0) {
    sourcesEl.textContent = "Sources: " + report.sources.join(" · ");
  } else {
    sourcesEl.textContent = "";
  }
}

// Helpers
function verdictClass(v) {
  if (!v) return "";
  const lower = v.toLowerCase();
  if (lower.includes("buy")) return "buy";
  if (lower.includes("pass")) return "pass";
  if (lower.includes("inspect")) return "inspect";
  return "";
}

function makeStat(label, value, detail, klass) {
  const stat = document.createElement("div");
  stat.className = "stat";
  stat.innerHTML = `
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-value ${klass || ""}">${escapeHtml(value)}</div>
    <div class="stat-detail">${escapeHtml(detail)}</div>
  `;
  return stat;
}

function formatPrice(n) {
  if (!n) return "—";
  return "$" + Number(n).toLocaleString();
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
