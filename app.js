const storageKey = "dialysisWeightRecords";
const maxRemovalKey = "dialysisMaxRemoval";
const nextDateKey = "dialysisNextDate";
const gainCheckKg = 3.0;

const form = document.querySelector("#recordForm");
const dateInput = document.querySelector("#date");
const dryWeightInput = document.querySelector("#dryWeight");
const maxRemovalInput = document.querySelector("#maxRemoval");
const preWeightInput = document.querySelector("#preWeight");
const postWeightInput = document.querySelector("#postWeight");
const noteInput = document.querySelector("#note");
const previewGain = document.querySelector("#previewGain");
const previewOverLimit = document.querySelector("#previewOverLimit");
const latestGain = document.querySelector("#latestGain");
const latestRemoval = document.querySelector("#latestRemoval");
const latestOverLimit = document.querySelector("#latestOverLimit");
const nextDateInput = document.querySelector("#nextDate");
const planLimit = document.querySelector("#planLimit");
const planAllowance = document.querySelector("#planAllowance");
const planPerDay = document.querySelector("#planPerDay");
const recordsBody = document.querySelector("#recordsBody");
const emptyState = document.querySelector("#emptyState");
const chart = document.querySelector("#chart");
const clearAllButton = document.querySelector("#clearAll");
const exportCsvButton = document.querySelector("#exportCsv");
const statusMessage = document.querySelector("#statusMessage");

let records = loadRecords();

dateInput.value = today();
maxRemovalInput.value = localStorage.getItem(maxRemovalKey) || "3.3";
nextDateInput.value = localStorage.getItem(nextDateKey) || "";
fillLastDryWeight();
render();
updatePreview();

form.addEventListener("input", updatePreview);
nextDateInput.addEventListener("input", () => {
  localStorage.setItem(nextDateKey, nextDateInput.value);
  renderPlan();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const record = {
    id: createId(),
    date: dateInput.value,
    dryWeight: toNumber(dryWeightInput.value),
    maxRemoval: toNumber(maxRemovalInput.value),
    preWeight: toNumber(preWeightInput.value),
    postWeight: toNumber(postWeightInput.value),
    note: noteInput.value.trim(),
  };

  if (!isValidRecord(record)) {
    alert("体重を正しく入力してください。");
    return;
  }

  localStorage.setItem(maxRemovalKey, record.maxRemoval.toFixed(1));
  records = [record, ...records].sort((a, b) => b.date.localeCompare(a.date));
  saveRecords();
  form.reset();
  dateInput.value = today();
  maxRemovalInput.value = localStorage.getItem(maxRemovalKey) || "3.3";
  fillLastDryWeight();
  render();
  updatePreview();
});

recordsBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;

  records = records.filter((record) => record.id !== button.dataset.deleteId);
  saveRecords();
  render();
  fillLastDryWeight();
});

clearAllButton.addEventListener("click", () => {
  if (!records.length) return;
  if (!confirm("すべての記録を削除しますか？")) return;

  records = [];
  saveRecords();
  render();
  fillLastDryWeight();
  updatePreview();
});

exportCsvButton.addEventListener("click", () => {
  if (!records.length) {
    alert("書き出す記録がありません。");
    return;
  }

  const header = ["日付", "ドライウェイトkg", "除水上限kg", "透析前kg", "透析後kg", "体重増加量kg", "上限オーバーkg", "メモ"];
  const rows = records.map((record) => [
    record.date,
    record.dryWeight,
    getMaxRemoval(record),
    record.preWeight,
    record.postWeight,
    formatOptionalNumber(calcGain(record)),
    calcOverLimit(record),
    record.note,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dialysis-weight-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

function render() {
  emptyState.classList.toggle("is-visible", records.length === 0);
  recordsBody.innerHTML = records.map(renderRow).join("");

  const latest = records[0];
  latestGain.textContent = latest ? formatOptionalKg(calcGain(latest)) : "-- kg";
  latestRemoval.textContent = latest ? formatKg(calcRemoval(latest)) : "-- kg";
  latestOverLimit.textContent = latest ? formatKg(calcOverLimit(latest)) : "-- kg";

  updateStatus(latest);
  renderChart();
  renderPlan();
}

function renderRow(record) {
  const noteTitle = record.note ? ` title="${escapeHtml(record.note)}"` : "";
  return `
    <tr${noteTitle}>
      <td>${escapeHtml(record.date)}</td>
      <td>${formatKg(record.dryWeight)}</td>
      <td>${formatKg(record.preWeight)}</td>
      <td>${formatKg(record.postWeight)}</td>
      <td>${formatOptionalKg(calcGain(record))}</td>
      <td>${formatKg(calcOverLimit(record))}</td>
      <td><button class="delete" type="button" data-delete-id="${record.id}">削除</button></td>
    </tr>
  `;
}

function updatePreview() {
  const record = {
    dryWeight: toNumber(dryWeightInput.value),
    maxRemoval: toNumber(maxRemovalInput.value),
    preWeight: toNumber(preWeightInput.value),
    postWeight: toNumber(postWeightInput.value),
  };

  const previousPostWeight = getPreviousPostWeightForNewRecord();
  previewGain.textContent = Number.isFinite(record.preWeight) && previousPostWeight !== null
    ? formatKg(record.preWeight - previousPostWeight)
    : "-- kg";
  previewOverLimit.textContent = Number.isFinite(record.preWeight) && Number.isFinite(record.dryWeight) && Number.isFinite(record.maxRemoval)
    ? formatKg(calcOverLimit(record))
    : "-- kg";
}

function updateStatus(latest) {
  statusMessage.classList.remove("is-check");

  if (!latest) {
    statusMessage.textContent = "記録すると、次回からドライウェイトを自動で入れます。";
    return;
  }

  const gain = calcGain(latest);
  if (!Number.isFinite(gain)) {
    statusMessage.textContent = `前回のドライウェイト ${formatKg(latest.dryWeight)} を次回入力に引き継ぎます。`;
    return;
  }
  const overLimit = calcOverLimit(latest);
  if (overLimit > 0) {
    statusMessage.classList.add("is-check");
    statusMessage.textContent = `DW + 除水上限 ${formatKg(getMaxRemoval(latest))} を ${formatKg(overLimit)} オーバーしています。透析施設の指示に従って確認してください。`;
    return;
  }

  statusMessage.textContent = `DW + 除水上限 ${formatKg(getMaxRemoval(latest))} の範囲内です。前回のドライウェイトを次回入力に引き継ぎます。`;
}

function fillLastDryWeight() {
  if (dryWeightInput.value || !records.length) return;
  dryWeightInput.value = records[0].dryWeight.toFixed(1);
}

function loadRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(storageKey, JSON.stringify(records));
}

function isValidRecord(record) {
  return record.date && [record.dryWeight, record.maxRemoval, record.preWeight, record.postWeight].every((value) => Number.isFinite(value) && value > 0);
}

function calcGain(record) {
  const previousPostWeight = getPreviousPostWeight(record);
  return previousPostWeight === null ? NaN : roundOne(record.preWeight - previousPostWeight);
}

function calcRemoval(record) {
  return roundOne(record.preWeight - record.postWeight);
}

function calcOverLimit(record) {
  return Math.max(0, roundOne(record.preWeight - (record.dryWeight + getMaxRemoval(record))));
}

function getMaxRemoval(record) {
  return Number.isFinite(record.maxRemoval) ? record.maxRemoval : toNumber(localStorage.getItem(maxRemovalKey) || "3.3");
}

function renderPlan() {
  const latest = records[0];
  if (!latest) {
    planLimit.textContent = "-- kg";
    planAllowance.textContent = "-- kg";
    planPerDay.textContent = "-- kg";
    return;
  }

  const limitWeight = calcLimitWeight(latest);
  const allowance = roundOne(limitWeight - latest.postWeight);
  planLimit.textContent = formatKg(limitWeight);
  planAllowance.textContent = allowance >= 0 ? formatKg(allowance) : `${formatKg(Math.abs(allowance))} 超過`;

  const days = daysUntil(nextDateInput.value);
  if (!days || allowance < 0) {
    planPerDay.textContent = "-- kg";
    return;
  }

  planPerDay.textContent = formatKg(allowance / days);
}

function daysUntil(value) {
  if (!value) return null;
  const start = new Date(`${today()}T00:00:00`);
  const end = new Date(`${value}T00:00:00`);
  const diff = Math.ceil((end - start) / 86400000);
  return diff > 0 ? diff : null;
}

function renderChart() {
  if (!records.length) {
    chart.innerHTML = '<div class="chart-empty">記録を保存するとグラフが表示されます。</div>';
    return;
  }

  const ordered = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const width = 760;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 42, left: 52 };
  const values = ordered.flatMap((record) => [record.preWeight, calcLimitWeight(record)]);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xStep = ordered.length > 1 ? plotWidth / (ordered.length - 1) : 0;

  const x = (index) => padding.left + (ordered.length > 1 ? index * xStep : plotWidth / 2);
  const y = (value) => padding.top + ((max - value) / (max - min)) * plotHeight;
  const points = (getter) => ordered.map((record, index) => `${x(index)},${y(getter(record))}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => min + ((max - min) / 4) * index);

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="透析前体重と上限体重のグラフ">
      ${yTicks
        .map((tick) => {
          const tickY = y(tick);
          return `
            <line x1="${padding.left}" y1="${tickY}" x2="${width - padding.right}" y2="${tickY}" stroke="#e6eeee" />
            <text x="${padding.left - 10}" y="${tickY + 4}" text-anchor="end" font-size="11" fill="#64707d">${roundOne(tick).toFixed(1)}</text>
          `;
        })
        .join("")}
      <polyline points="${points(calcLimitWeight)}" fill="none" stroke="#d97706" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${points((record) => record.preWeight)}" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${ordered
        .map((record, index) => {
          const dotX = x(index);
          const preY = y(record.preWeight);
          const limitY = y(calcLimitWeight(record));
          const over = calcOverLimit(record) > 0;
          return `
            <circle cx="${dotX}" cy="${limitY}" r="4" fill="#d97706" />
            <circle cx="${dotX}" cy="${preY}" r="5" fill="${over ? "#b42318" : "#0f766e"}" />
            <text x="${dotX}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#64707d">${formatShortDate(record.date)}</text>
          `;
        })
        .join("")}
    </svg>
  `;
}

function calcLimitWeight(record) {
  return roundOne(record.dryWeight + getMaxRemoval(record));
}

function formatShortDate(value) {
  const parts = value.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : value;
}

function toNumber(value) {
  return Number.parseFloat(value);
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function formatKg(value) {
  return `${roundOne(value).toFixed(1)} kg`;
}

function formatOptionalKg(value) {
  return Number.isFinite(value) ? formatKg(value) : "-- kg";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatOptionalNumber(value) {
  return Number.isFinite(value) ? roundOne(value) : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPreviousPostWeight(record) {
  const olderRecords = records
    .filter((candidate) => candidate.id !== record.id && candidate.date < record.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return olderRecords.length ? olderRecords[0].postWeight : null;
}

function getPreviousPostWeightForNewRecord() {
  if (!records.length) return null;
  const currentDate = dateInput.value || today();
  const olderRecords = records
    .filter((record) => record.date < currentDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  return olderRecords.length ? olderRecords[0].postWeight : records[0].postWeight;
}
