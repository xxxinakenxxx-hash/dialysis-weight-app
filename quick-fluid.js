const quickFluidStorageKey = "dialysisFluidRecords";
const quickFluidResetAtKey = "dialysisFluidResetAt";
const quickButtons = document.querySelectorAll("[data-fluid-quick]");
const quickAmountInput = document.querySelector("#quickFluidAmount");
const quickSaveButton = document.querySelector("#quickFluidSave");
const quickTotal = document.querySelector("#quickFluidTotal");
const quickMessage = document.querySelector("#quickFluidMessage");

quickButtons.forEach((button) => {
  button.addEventListener("click", () => addQuickFluid(Number.parseFloat(button.dataset.fluidQuick)));
});

quickSaveButton.addEventListener("click", () => {
  const amount = Number.parseFloat(quickAmountInput.value);
  if (addQuickFluid(amount)) quickAmountInput.value = "";
});

renderQuickFluidTotal();

function addQuickFluid(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("飲水量をmlで入力してください。");
    return false;
  }

  const records = loadQuickFluidRecords();
  records.unshift({
    id: createQuickId(),
    date: quickToday(),
    amount,
    note: "クイック記録",
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(quickFluidStorageKey, JSON.stringify(records));
  renderQuickFluidTotal();
  renderQuickFluidTable(records);
  showQuickMessage(`${formatQuickMl(amount)} を記録しました`);
  return true;
}

function renderQuickFluidTotal() {
  const records = loadQuickFluidRecords();
  const resetAt = Number(localStorage.getItem(quickFluidResetAtKey) || 0);
  const total = records
    .filter((record) => new Date(record.createdAt || `${record.date}T00:00:00`).getTime() >= resetAt)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);

  if (quickTotal) quickTotal.textContent = formatQuickMl(total);
  const pageTotal = document.querySelector("#todayFluidTotal");
  if (pageTotal) pageTotal.textContent = formatQuickMl(total);

  const latest = document.querySelector("#latestFluid");
  if (latest) latest.textContent = records[0] ? formatQuickMl(records[0].amount) : "-- ml";
}

function renderQuickFluidTable(records = loadQuickFluidRecords()) {
  const body = document.querySelector("#fluidRecordsBody");
  const empty = document.querySelector("#fluidEmptyState");
  if (!body) return;

  if (empty) empty.classList.toggle("is-visible", records.length === 0);
  body.innerHTML = records.map((record) => `
    <tr>
      <td>${escapeQuickHtml(record.date)}</td>
      <td>${formatQuickMl(record.amount)}</td>
      <td>${escapeQuickHtml(record.note || "")}</td>
      <td></td>
    </tr>
  `).join("");
}

function loadQuickFluidRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(quickFluidStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function showQuickMessage(message) {
  quickMessage.textContent = message;
  window.setTimeout(() => {
    if (quickMessage.textContent === message) quickMessage.textContent = "";
  }, 2200);
}

function quickToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createQuickId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatQuickMl(value) {
  return `${Math.round(Number(value || 0))} ml`;
}

function escapeQuickHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
