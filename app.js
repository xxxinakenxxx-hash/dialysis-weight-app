const storageKey = "dialysisWeightRecords";
const maxRemovalKey = "dialysisMaxRemoval";
const nextDateKey = "dialysisNextDate";
const gainCheckKg = 3.0;

const waterLogsKey = "dialysisWaterLogs";
const mealLogsKey = "dialysisMealLogs";
const waterGoalKey = "dialysisWaterGoal";

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

const waterGoalInput = document.querySelector("#waterGoal");
const waterForm = document.querySelector("#waterForm");
const waterAmountInput = document.querySelector("#waterAmount");
const waterNoteInput = document.querySelector("#waterNote");
const mealForm = document.querySelector("#mealForm");
const mealSaltInput = document.querySelector("#mealSalt");
const mealWaterFoodInput = document.querySelector("#mealWaterFood");
const mealNoteInput = document.querySelector("#mealNote");
const todayWaterTotal = document.querySelector("#todayWaterTotal");
const todayWaterRemaining = document.querySelector("#todayWaterRemaining");
const todayMealCount = document.querySelector("#todayMealCount");
const actionSteps = document.querySelector("#actionSteps");

let records = loadRecords();
let waterLogs = loadList(waterLogsKey);
let mealLogs = loadList(mealLogsKey);

dateInput.value = today();
maxRemovalInput.value = localStorage.getItem(maxRemovalKey) || "3.3";
nextDateInput.value = localStorage.getItem(nextDateKey) || "";
waterGoalInput.value = localStorage.getItem(waterGoalKey) || "1000";
fillLastDryWeight();
render();
updatePreview();

form.addEventListener("input", updatePreview);
nextDateInput.addEventListener("input", () => {
  localStorage.setItem(nextDateKey, nextDateInput.value);
  renderPlan();
  renderHydrationSummary();
});

waterGoalInput.addEventListener("input", () => {
  const goal = Math.max(100, toNumber(waterGoalInput.value) || 1000);
  localStorage.setItem(waterGoalKey, String(roundOne(goal)));
  renderHydrationSummary();
});

waterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = toNumber(waterAmountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) return;
  waterLogs.unshift({ id: createId(), date: today(), amountMl: Math.round(amount), note: waterNoteInput.value.trim() });
  localStorage.setItem(waterLogsKey, JSON.stringify(waterLogs));
  waterForm.reset();
  renderHydrationSummary();
});

document.querySelectorAll("[data-water-quick]").forEach((button) => {
  button.addEventListener("click", () => {
    waterAmountInput.value = button.dataset.waterQuick;
    waterForm.requestSubmit();
  });
});

mealForm.addEventListener("submit", (event) => {
  event.preventDefault();
  mealLogs.unshift({ id: createId(), date: today(), salt: mealSaltInput.value, waterFood: mealWaterFoodInput.value, note: mealNoteInput.value.trim() });
  localStorage.setItem(mealLogsKey, JSON.stringify(mealLogs));
  mealForm.reset();
  mealSaltInput.value = "普通";
  mealWaterFoodInput.value = "中";
  renderHydrationSummary();
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
@@ -108,50 +162,51 @@ exportCsvButton.addEventListener("click", () => {
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
  renderHydrationSummary();
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

@@ -170,50 +225,107 @@ function updateStatus(latest) {
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


function renderHydrationSummary() {
  const todayValue = today();
  const goal = Math.max(100, toNumber(waterGoalInput.value) || 1000);
  const total = waterLogs.filter((log) => log.date === todayValue).reduce((sum, log) => sum + (toNumber(log.amountMl) || 0), 0);
  const meals = mealLogs.filter((log) => log.date === todayValue).length;
  const remaining = Math.max(0, Math.round(goal - total));
  const hasHighSaltMeal = mealLogs.some((log) => log.date === todayValue && log.salt === "多め");

  todayWaterTotal.textContent = `${Math.round(total)} mL`;
  todayWaterRemaining.textContent = `${remaining} mL`;
  todayMealCount.textContent = `${meals} 件`;

  renderActionSteps(remaining, hasHighSaltMeal);
}

function renderActionSteps(remaining, hasHighSaltMeal) {
  if (!actionSteps) return;

  let steps = [
    "+100mL か +200mL を押して、飲んだ分を記録する",
    `残り ${remaining}mL を確認する`,
    "食事したら食事メモを保存する",
  ];

  if (remaining === 0) {
    steps = [
      "今日は飲水目標に到達しています",
      "のどが渇くときは一口（50mL程度）ずつにする",
      "食事メモだけ続けて記録する",
    ];
  } else if (remaining <= 200) {
    steps = [
      "残りが少ないため、次は 50〜100mL だけにする",
      `飲んだら必ず記録して、残り ${remaining}mL を超えないようにする`,
      "食事メモを保存して今日の傾向を残す",
    ];
  } else if (hasHighSaltMeal) {
    steps = [
      "塩分が多めの食事があるため、次の飲水は少なめにする",
      `残り ${remaining}mL の範囲で、こまめに分けて飲む`,
      "次の食事は塩分を控えめにする",
    ];
  }

  actionSteps.innerHTML = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
}

function loadList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
