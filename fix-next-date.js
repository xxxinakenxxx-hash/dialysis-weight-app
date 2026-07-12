(function () {
  const key = "dialysisNextDate";
  const input = document.querySelector("#nextDate");
  if (!input) return;

  const today = localToday();

  function clearPastDate() {
    if (input.value && input.value < today) {
      input.value = "";
      localStorage.removeItem(key);
      if (typeof renderPlan === "function") renderPlan();
      return;
    }

    if (input.value) {
      localStorage.setItem(key, input.value);
    }
  }

  const savedDate = localStorage.getItem(key) || "";
  if (savedDate && savedDate < today) {
    localStorage.removeItem(key);
    input.value = "";
    if (typeof renderPlan === "function") renderPlan();
  }

  input.addEventListener("input", clearPastDate);
  input.addEventListener("change", clearPastDate);

  function localToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
})();
