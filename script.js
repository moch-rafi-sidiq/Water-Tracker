(() => {
  "use strict";

  const STORAGE_KEYS = {
    records: "tetes.records.v1",
    settings: "tetes.settings.v1",
    demoSeed: "tetes.demoSeed.v1"
  };

  const DEFAULT_SETTINGS = Object.freeze({
    targetMl: 2000,
    targetUnit: "ml",
    amountUnit: "ml"
  });

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const numberFormatter = new Intl.NumberFormat("id-ID");
  const longDateFormatter = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const fullDayFormatter = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "short" });

  const state = {
    records: [],
    settings: { ...DEFAULT_SETTINGS },
    todayKey: "",
    chartAnchorKey: "",
    targetEditorUnit: "ml",
    storageAvailable: true,
    dataWarning: false,
    demoLoaded: false
  };

  const els = {};
  let confirmCallback = null;
  let toastDismissTimer = null;
  let toastHideTimer = null;
  let toastStartedAt = 0;
  let toastRemaining = 0;
  let toastElement = null;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function localTimeValue(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function isValidDateKey(value) {
    if (typeof value !== "string") return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function dateFromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12, 0, 0, 0);
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  function formatNumber(value) {
    return numberFormatter.format(value);
  }

  function formatMl(value) {
    return `${formatNumber(value)} ml`;
  }

  function formatDateRange(start, end) {
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const startMonth = start.getMonth();
    const endMonth = end.getMonth();

    if (startYear === endYear && startMonth === endMonth) {
      return `${start.getDate()}–${end.getDate()} ${MONTHS_SHORT[endMonth]} ${endYear}`;
    }
    if (startYear === endYear) {
      return `${start.getDate()} ${MONTHS_SHORT[startMonth]} – ${end.getDate()} ${MONTHS_SHORT[endMonth]} ${endYear}`;
    }
    return `${start.getDate()} ${MONTHS_SHORT[startMonth]} ${startYear} – ${end.getDate()} ${MONTHS_SHORT[endMonth]} ${endYear}`;
  }

  function createIcon(name, className = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (className) svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${name}`);
    svg.appendChild(use);
    return svg;
  }

  function parseLocalizedNumber(raw) {
    if (typeof raw !== "string") return null;
    let value = raw.trim().replace(/\s+/g, "");
    if (!value) return null;
    if (!/^[+-]?\d[\d.,]*$/.test(value) || /[.,]$/.test(value)) return null;

    let sign = 1;
    if (value.startsWith("-")) {
      sign = -1;
      value = value.slice(1);
    } else if (value.startsWith("+")) {
      value = value.slice(1);
    }
    if (!value) return null;

    const hasComma = value.includes(",");
    const hasDot = value.includes(".");
    let normalized = value;

    if (hasComma && hasDot) {
      if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
        if ((value.match(/,/g) || []).length > 1) return null;
        normalized = value.replace(/\./g, "").replace(",", ".");
      } else {
        if ((value.match(/\./g) || []).length > 1) return null;
        normalized = value.replace(/,/g, "");
      }
    } else if (hasComma) {
      if ((value.match(/,/g) || []).length > 1) return null;
      normalized = value.replace(",", ".");
    } else if (hasDot) {
      const dotCount = (value.match(/\./g) || []).length;
      if (dotCount > 1) {
        if (!/^\d{1,3}(\.\d{3})+$/.test(value)) return null;
        normalized = value.replace(/\./g, "");
      } else {
        const [integerPart, fractionPart] = value.split(".");
        if (fractionPart.length === 3 && integerPart !== "0") {
          normalized = integerPart + fractionPart;
        }
      }
    }

    const result = Number(normalized);
    return Number.isFinite(result) ? result * sign : null;
  }

  function editableTargetValue(targetMl, unit) {
    const value = unit === "l" ? targetMl / 1000 : targetMl;
    return String(Number(value.toFixed(3))).replace(".", ",");
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      state.storageAvailable = false;
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      state.storageAvailable = false;
      return false;
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      state.storageAvailable = false;
      return false;
    }
  }

  function parseRecords(raw) {
    if (raw === null) return { records: [], warning: false };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { records: [], warning: true };
    }
    if (!Array.isArray(parsed)) return { records: [], warning: true };

    const seenIds = new Set();
    const records = [];
    let skipped = false;

    parsed.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        skipped = true;
        return;
      }

      const id = typeof item.id === "string" ? item.id.trim() : "";
      const amount = Number(item.amountMl);
      const rawTimestamp = typeof item.timestamp === "number" ? item.timestamp : Date.parse(item.timestamp);
      const timestampMs = Number(rawTimestamp);

      if (
        !id ||
        seenIds.has(id) ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !Number.isSafeInteger(Math.round(amount)) ||
        !Number.isFinite(timestampMs)
      ) {
        skipped = true;
        return;
      }

      const timestamp = new Date(timestampMs);
      const recordDate = isValidDateKey(item.localDate)
        ? item.localDate
        : localDateKey(timestamp);
      const recordTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(item.localTime)
        ? item.localTime
        : localTimeValue(timestamp);

      seenIds.add(id);
      records.push({
        id,
        amountMl: Math.round(amount),
        timestamp: timestamp.toISOString(),
        localDate: recordDate,
        localTime: recordTime
      });
    });

    records.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return { records, warning: skipped };
  }

  function parseSettings(raw) {
    if (raw === null) {
      return { settings: { ...DEFAULT_SETTINGS }, warning: false };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { settings: { ...DEFAULT_SETTINGS }, warning: true };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { settings: { ...DEFAULT_SETTINGS }, warning: true };
    }

    const parsedTarget = Math.round(Number(parsed.targetMl));
    const validTarget =
      Number.isSafeInteger(parsedTarget) && parsedTarget > 0;

    return {
      settings: {
        targetMl: validTarget ? parsedTarget : DEFAULT_SETTINGS.targetMl,
        targetUnit: parsed.targetUnit === "l" ? "l" : "ml",
        amountUnit: parsed.amountUnit === "l" ? "l" : "ml"
      },
      warning: !validTarget
    };
  }

  function loadState() {
    const recordsRaw = readStorage(STORAGE_KEYS.records);
    const settingsRaw = readStorage(STORAGE_KEYS.settings);
    const demoSeedRaw = readStorage(STORAGE_KEYS.demoSeed);
    const loadedRecords = parseRecords(recordsRaw);
    const loadedSettings = parseSettings(settingsRaw);

    state.records = loadedRecords.records;
    state.settings = loadedSettings.settings;
    state.dataWarning = loadedRecords.warning || loadedSettings.warning;
    state.todayKey = localDateKey(new Date());
    state.chartAnchorKey = state.todayKey;

    if (recordsRaw === null && demoSeedRaw === null && state.storageAvailable) {
      state.demoLoaded = seedDemoRecords();
    }
  }

  function seedDemoRecords() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayMinutes = [240, 120, 30].map((offset) => Math.max(1, nowMinutes - offset));
    const todayAmounts = [250, 350, 250];
    const yesterday = addDays(now, -1);
    const yesterdayMinutes = [8 * 60 + 15, 14 * 60 + 30];
    const yesterdayAmounts = [300, 400];
    const records = [];

    const buildRecord = (amount, date, minutes) => {
      const hours = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timestamp = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        hours,
        minute,
        0,
        0
      );
      const id = window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `demo-${timestamp.getTime()}-${Math.random().toString(36).slice(2, 9)}`;

      records.push({
        id,
        amountMl: amount,
        timestamp: timestamp.toISOString(),
        localDate: localDateKey(timestamp),
        localTime: localTimeValue(timestamp)
      });
    };

    todayMinutes.forEach((minutes, index) => {
      buildRecord(todayAmounts[index], new Date(year, month, day, 12, 0, 0, 0), minutes);
    });

    yesterdayMinutes.forEach((minutes, index) => {
      buildRecord(yesterdayAmounts[index], yesterday, minutes);
    });

    records.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    state.records = records;
    persistRecords();
    writeStorage(STORAGE_KEYS.demoSeed, new Date().toISOString());
    return records.length > 0;
  }

  function persistRecords() {
    return writeStorage(STORAGE_KEYS.records, JSON.stringify(state.records));
  }

  function persistSettings() {
    return writeStorage(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  }

  function cacheElements() {
    const ids = [
      "currentDate", "openSettingsButton", "targetButton", "todayTotal", "targetValue",
      "heroTitle", "heroStatus", "heroStatusText", "progressRing", "ringProgress",
      "percentValue", "ringFootnote", "customForm", "customAmount", "customUnit",
      "customSubmit", "customError", "customHint", "historyList", "historyEmpty",
      "historyCount", "emptyAddButton", "summaryToday", "summarySessions", "summaryAverage",
      "summaryTodayMeta", "summaryAverageMeta", "prevWeekButton", "nextWeekButton",
      "weekLabel", "weeklyChart", "chartDetail", "settingsDialog", "closeSettingsButton",
      "targetForm", "targetAmount", "targetSuffix", "targetHelp", "targetError",
      "storageMeta", "resetHistoryButton", "resetAllButton", "confirmDialog",
      "confirmTitle", "confirmMessage", "confirmCancelButton", "confirmActionButton",
      "toastRegion", "addSection", "footerYear"
    ];

    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });

    els.quickAddButtons = Array.from(document.querySelectorAll(".quick-add"));
    els.targetUnitRadios = Array.from(document.querySelectorAll('input[name="targetUnit"]'));
    els.progressStage = document.querySelector(".progress-stage");
    els.heroStatusIconUse = document.querySelector("#heroStatus .status-icon use");
    els.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  }

  function getRecordsForDate(dateKey) {
    return state.records.filter((record) => record.localDate === dateKey);
  }

  function sortNewest(records) {
    return records.slice().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }

  function getDailyTotals() {
    const map = new Map();
    state.records.forEach((record) => {
      const current = map.get(record.localDate) || { total: 0, sessions: 0 };
      current.total += record.amountMl;
      current.sessions += 1;
      map.set(record.localDate, current);
    });
    return map;
  }

  function renderCurrentDate() {
    const now = new Date();
    els.currentDate.dateTime = state.todayKey;
    els.currentDate.textContent = capitalize(longDateFormatter.format(now));
    els.footerYear.textContent = String(now.getFullYear());
  }

  function renderToday() {
    const todayRecords = getRecordsForDate(state.todayKey);
    const total = todayRecords.reduce((sum, record) => sum + record.amountMl, 0);
    const target = state.settings.targetMl;
    const rawPercent = target > 0 ? (total / target) * 100 : 0;
    const roundedPercent = Math.round(rawPercent);
    const completed = total >= target;

    els.todayTotal.textContent = formatNumber(total);
    els.targetValue.textContent = formatMl(target);
    els.percentValue.textContent = formatNumber(roundedPercent);
    els.ringFootnote.textContent = `${formatNumber(total)} ml dari ${formatNumber(target)} ml`;
    els.ringProgress.style.strokeDashoffset = String(100 - Math.min(100, rawPercent));
    els.percentValue.parentElement.classList.toggle("is-long", String(roundedPercent).length > 3);

    els.progressRing.setAttribute("aria-valuenow", String(Math.min(100, roundedPercent)));
    els.progressRing.setAttribute("aria-valuetext", `${formatNumber(roundedPercent)} persen dari target harian, ${formatNumber(total)} mililiter dari ${formatNumber(target)} mililiter`);
    els.targetButton.setAttribute("aria-label", `Ubah target harian, saat ini ${formatNumber(target)} mililiter`);

    els.heroTitle.textContent = completed ? "Target hari ini tercapai." : "Tetap terhidrasi hari ini.";
    els.heroStatus.classList.toggle("is-complete", completed);
    els.heroStatusIconUse.setAttribute("href", completed ? "#i-check" : "#i-droplet");

    if (total === 0) {
      els.heroStatusText.innerHTML = `Sisa <strong>${formatNumber(target)} ml</strong> menuju target hari ini.`;
    } else if (total < target) {
      els.heroStatusText.innerHTML = `Sisa <strong>${formatNumber(target - total)} ml</strong> lagi menuju target.`;
    } else if (total === target) {
      els.heroStatusText.innerHTML = "<strong>Target tercapai.</strong> Tepat sesuai target hari ini.";
    } else {
      els.heroStatusText.innerHTML = `<strong>Target tercapai.</strong> ${formatNumber(total - target)} ml di atas target hari ini.`;
    }
  }

  function renderHistory(highlightId = null) {
    const records = sortNewest(getRecordsForDate(state.todayKey));
    els.historyList.replaceChildren();

    records.forEach((record) => {
      const item = document.createElement("li");
      item.className = "history-item";
      if (record.id === highlightId) item.classList.add("is-new");

      const icon = document.createElement("span");
      icon.className = "history-item-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.appendChild(createIcon("droplet"));

      const content = document.createElement("div");
      content.className = "history-item-content";

      const amount = document.createElement("span");
      amount.className = "history-amount";
      amount.textContent = formatMl(record.amountMl);

      const time = document.createElement("time");
      time.className = "history-time";
      time.dateTime = record.timestamp;
      time.appendChild(createIcon("clock"));
      time.appendChild(document.createTextNode(` ${record.localTime.replace(":", ".")}`));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "icon-button delete-button";
      deleteButton.setAttribute("aria-label", `Hapus catatan ${formatMl(record.amountMl)} pukul ${record.localTime.replace(":", ".")}`);
      deleteButton.title = "Hapus catatan";
      deleteButton.appendChild(createIcon("trash"));
      deleteButton.addEventListener("click", () => deleteRecord(record.id));

      content.append(amount, time);
      item.append(icon, content, deleteButton);
      els.historyList.appendChild(item);
    });

    const count = records.length;
    els.historyCount.textContent = String(count);
    els.historyCount.setAttribute("aria-label", `${count} catatan`);
    els.historyList.hidden = count === 0;
    els.historyEmpty.hidden = count > 0;

    if (highlightId) {
      els.historyList.scrollTop = 0;
    }
  }

  function renderSummary() {
    const todayRecords = getRecordsForDate(state.todayKey);
    const todayTotal = todayRecords.reduce((sum, record) => sum + record.amountMl, 0);
    const dailyTotals = getDailyTotals();
    const activeDays = dailyTotals.size;
    const allTotal = state.records.reduce((sum, record) => sum + record.amountMl, 0);
    const average = activeDays > 0 ? Math.round(allTotal / activeDays) : null;

    els.summaryToday.textContent = formatNumber(todayTotal);
    els.summarySessions.textContent = formatNumber(todayRecords.length);
    els.summaryAverage.textContent = average === null ? "—" : formatNumber(average);
    els.summaryTodayMeta.textContent = `Target ${formatMl(state.settings.targetMl)}`;
    els.summaryAverageMeta.textContent = activeDays > 0
      ? `Dari ${formatNumber(activeDays)} hari berisi catatan`
      : "Belum ada data harian";
  }

  function activateChartColumn(button, dateKey, value, sessions) {
    els.weeklyChart.querySelectorAll(".chart-column").forEach((column) => {
      column.classList.toggle("is-active", column === button);
    });

    const date = dateFromKey(dateKey);
    const dateLabel = capitalize(fullDayFormatter.format(date));
    if (value > 0) {
      const sessionLabel = `${formatNumber(sessions)} sesi`;
      els.chartDetail.innerHTML = `<strong>${dateLabel}</strong> · ${formatMl(value)} · ${sessionLabel}`;
    } else {
      els.chartDetail.innerHTML = `<strong>${dateLabel}</strong> · Belum ada catatan.`;
    }
  }

  function renderChart() {
    const anchor = dateFromKey(state.chartAnchorKey);
    const days = [];

    for (let index = 6; index >= 0; index -= 1) {
      const date = addDays(anchor, -index);
      days.push({ date, key: localDateKey(date) });
    }

    const dailyTotals = getDailyTotals();
    const values = days.map((day) => (dailyTotals.get(day.key) || {}).total || 0);
    const maxValue = Math.max(1, ...values);
    const rangeLabel = formatDateRange(days[0].date, days[6].date);
    const periodHasData = values.some((value) => value > 0);

    els.weekLabel.textContent = rangeLabel;
    els.weekLabel.title = rangeLabel;
    els.nextWeekButton.disabled = state.chartAnchorKey >= state.todayKey;
    els.nextWeekButton.title = els.nextWeekButton.disabled ? "Ini adalah periode terbaru" : "Tampilkan tujuh hari berikutnya";
    els.weeklyChart.replaceChildren();
    els.weeklyChart.setAttribute("aria-label", `Grafik konsumsi air, ${rangeLabel}`);

    days.forEach((day) => {
      const summary = dailyTotals.get(day.key) || { total: 0, sessions: 0 };
      const value = summary.total;
      const isEmpty = value === 0;
      const heightPercent = value > 0 ? Math.max(5, Math.round((value / maxValue) * 100)) : 0;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "chart-column";
      if (day.key === state.todayKey) button.classList.add("is-today");
      if (isEmpty) button.dataset.empty = "true";
      button.setAttribute(
        "aria-label",
        `${capitalize(fullDayFormatter.format(day.date))}: ${isEmpty ? "belum ada catatan" : `${formatMl(value)}, ${formatNumber(summary.sessions)} sesi minum`}`
      );

      const valueLabel = document.createElement("span");
      valueLabel.className = "chart-value";
      valueLabel.setAttribute("aria-hidden", "true");
      valueLabel.textContent = formatNumber(value);

      const barArea = document.createElement("span");
      barArea.className = "chart-bar-area";
      barArea.setAttribute("aria-hidden", "true");

      const bar = document.createElement("span");
      bar.className = "chart-bar";
      bar.style.height = `${heightPercent}%`;
      barArea.appendChild(bar);

      const dayLabel = document.createElement("span");
      dayLabel.className = "chart-day";
      dayLabel.setAttribute("aria-hidden", "true");

      const weekday = document.createElement("span");
      weekday.textContent = capitalize(weekdayFormatter.format(day.date).replace(".", ""));
      const dateNumber = document.createElement("strong");
      dateNumber.textContent = String(day.date.getDate());
      dayLabel.append(weekday, dateNumber);

      button.append(valueLabel, barArea, dayLabel);
      button.addEventListener("focus", () => activateChartColumn(button, day.key, value, summary.sessions));
      button.addEventListener("mouseenter", () => activateChartColumn(button, day.key, value, summary.sessions));
      button.addEventListener("click", () => activateChartColumn(button, day.key, value, summary.sessions));
      els.weeklyChart.appendChild(button);
    });

    els.chartDetail.textContent = periodHasData
      ? "Arahkan kursor atau ketuk batang untuk melihat detail harian."
      : "Belum ada catatan pada periode ini.";
  }

  function renderAll() {
    renderCurrentDate();
    renderToday();
    renderHistory();
    renderSummary();
    renderChart();
  }

  function updateStorageMeta() {
    const days = getDailyTotals().size;
    if (state.records.length === 0) {
      els.storageMeta.textContent = state.storageAvailable
        ? "Belum ada catatan tersimpan."
        : "Penyimpanan browser tidak tersedia pada sesi ini.";
      return;
    }

    const notes = `${formatNumber(state.records.length)} catatan dari ${formatNumber(days)} hari tersimpan di perangkat ini.`;
    els.storageMeta.textContent = state.storageAvailable
      ? notes
      : `${notes} Penyimpanan browser saat ini tidak dapat diakses.`;
  }

  function animateAdd(amount) {
    els.todayTotal.classList.remove("is-bumping");
    els.progressRing.classList.remove("is-pulsing");
    void els.todayTotal.offsetWidth;
    els.todayTotal.classList.add("is-bumping");
    els.progressRing.classList.add("is-pulsing");

    window.setTimeout(() => {
      els.todayTotal.classList.remove("is-bumping");
      els.progressRing.classList.remove("is-pulsing");
    }, 600);

    if (!els.reduceMotion.matches && els.progressStage) {
      const pill = document.createElement("span");
      pill.className = "add-float";
      pill.textContent = `+${formatMl(amount)}`;
      els.progressStage.appendChild(pill);
      window.setTimeout(() => pill.remove(), 950);
    }
  }

  function clearCustomError() {
    els.customError.textContent = "";
    els.customForm.classList.remove("has-error");
    els.customAmount.removeAttribute("aria-invalid");
  }

  function showCustomError(message) {
    els.customError.textContent = message;
    els.customForm.classList.add("has-error");
    els.customAmount.setAttribute("aria-invalid", "true");
    els.customAmount.focus();
  }

  function clearTargetError() {
    els.targetError.textContent = "";
    els.targetForm.classList.remove("has-error");
    els.targetAmount.removeAttribute("aria-invalid");
  }

  function showTargetError(message) {
    els.targetError.textContent = message;
    els.targetForm.classList.add("has-error");
    els.targetAmount.setAttribute("aria-invalid", "true");
    els.targetAmount.focus();
  }

  function generateRecordId() {
    const existing = new Set(state.records.map((record) => record.id));
    let id = "";
    do {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        id = window.crypto.randomUUID();
      } else {
        id = `trx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      }
    } while (existing.has(id));
    return id;
  }

  function addWater(amountMl) {
    if (!Number.isSafeInteger(amountMl) || amountMl <= 0) return false;

    syncToCurrentDate(false);
    const now = new Date();
    const record = {
      id: generateRecordId(),
      amountMl,
      timestamp: now.toISOString(),
      localDate: localDateKey(now),
      localTime: localTimeValue(now)
    };

    state.records.push(record);
    const saved = persistRecords();
    const totalToday = getRecordsForDate(state.todayKey).reduce((sum, item) => sum + item.amountMl, 0);

    renderToday();
    renderHistory(record.id);
    renderSummary();
    renderChart();
    animateAdd(amountMl);

    if (saved) {
      showToast(`${formatMl(amountMl)} ditambahkan. Total hari ini ${formatMl(totalToday)}.`, {
        type: "success",
        icon: "check",
        duration: 4500
      });
    } else {
      showToast(`${formatMl(amountMl)} ditambahkan di layar, tetapi browser gagal menyimpannya.`, {
        type: "error",
        icon: "alert",
        duration: 8000
      });
    }

    return true;
  }

  function deleteRecord(recordId) {
    const index = state.records.findIndex((record) => record.id === recordId);
    if (index === -1) return;

    const [removed] = state.records.splice(index, 1);
    const saved = persistRecords();

    renderToday();
    renderHistory();
    renderSummary();
    renderChart();

    showToast(`${formatMl(removed.amountMl)} dihapus dari riwayat hari ini.`, {
      type: saved ? "info" : "error",
      icon: saved ? "trash" : "alert",
      duration: 8000,
      actionLabel: "Urungkan",
      onAction: () => undoDelete(removed)
    });
  }

  function undoDelete(record) {
    if (state.records.some((item) => item.id === record.id)) return;
    state.records.push(record);
    const saved = persistRecords();
    renderToday();
    renderHistory(record.id);
    renderSummary();
    renderChart();

    showToast(
      saved ? "Catatan berhasil dipulihkan." : "Catatan dipulihkan di layar, tetapi gagal disimpan oleh browser.",
      { type: saved ? "success" : "error", icon: saved ? "check" : "alert", duration: saved ? 3500 : 7500 }
    );
  }

  function syncToCurrentDate(announce = false) {
    const newKey = localDateKey(new Date());
    if (newKey === state.todayKey) {
      els.currentDate.dateTime = newKey;
      return false;
    }

    const wasViewingLatest = state.chartAnchorKey === state.todayKey;
    state.todayKey = newKey;
    if (wasViewingLatest) state.chartAnchorKey = newKey;

    renderAll();
    if (announce) {
      showToast("Hari baru dimulai. Catatan kemarin tetap tersimpan.", {
        type: "info",
        icon: "calendar",
        duration: 5500
      });
    }
    return true;
  }

  let lastTargetSubmit = 0;

  function pauseToastTimer() {
    if (!toastDismissTimer || !toastElement) return;
    window.clearTimeout(toastDismissTimer);
    toastDismissTimer = null;
    toastRemaining = Math.max(1000, toastRemaining - (Date.now() - toastStartedAt));
  }

  function resumeToastTimer() {
    if (!toastElement || toastRemaining <= 0) return;
    window.clearTimeout(toastDismissTimer);
    toastStartedAt = Date.now();
    toastDismissTimer = window.setTimeout(dismissToast, toastRemaining);
  }

  function dismissToast() {
    window.clearTimeout(toastDismissTimer);
    window.clearTimeout(toastHideTimer);
    toastDismissTimer = null;

    const currentToast = toastElement;
    if (!currentToast) return;
    toastElement = null;
    currentToast.classList.add("is-leaving");
    toastHideTimer = window.setTimeout(() => currentToast.remove(), 200);
  }

  function showToast(message, options = {}) {
    const {
      type = "success",
      icon = null,
      duration = 4500,
      actionLabel = "",
      onAction = null
    } = options;

    window.clearTimeout(toastDismissTimer);
    window.clearTimeout(toastHideTimer);
    toastDismissTimer = null;
    toastElement = null;
    els.toastRegion.replaceChildren();

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;

    const iconWrap = document.createElement("span");
    iconWrap.className = "toast-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    const defaultIcon = type === "error" ? "alert" : type === "info" ? "info" : "check";
    iconWrap.appendChild(createIcon(icon || defaultIcon));

    const messageElement = document.createElement("p");
    messageElement.className = "toast-message";
    messageElement.textContent = message;

    toast.append(iconWrap, messageElement);

    if (actionLabel && typeof onAction === "function") {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "toast-action";
      actionButton.textContent = actionLabel;
      actionButton.addEventListener("click", () => {
        dismissToast();
        onAction();
      });
      toast.appendChild(actionButton);
    }

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "toast-close";
    closeButton.setAttribute("aria-label", "Tutup notifikasi");
    closeButton.appendChild(createIcon("x"));
    closeButton.addEventListener("click", dismissToast);
    toast.appendChild(closeButton);

    toast.addEventListener("mouseenter", pauseToastTimer);
    toast.addEventListener("mouseleave", resumeToastTimer);
    toast.addEventListener("focusin", pauseToastTimer);
    toast.addEventListener("focusout", (event) => {
      if (!toast.contains(event.relatedTarget)) resumeToastTimer();
    });

    els.toastRegion.appendChild(toast);
    toastElement = toast;

    if (duration > 0) {
      toastRemaining = duration;
      toastStartedAt = Date.now();
      toastDismissTimer = window.setTimeout(dismissToast, duration);
    } else {
      toastRemaining = 0;
    }
  }

  function syncModalState() {
    const hasOpenDialog = els.settingsDialog.open || els.confirmDialog.open;
    document.body.classList.toggle("modal-open", hasOpenDialog);
  }

  function updateTargetUnitUi(unit) {
    state.targetEditorUnit = unit;
    els.targetSuffix.textContent = unit === "l" ? "liter" : "ml";
    els.targetHelp.textContent = unit === "l"
      ? "Contoh: 2 liter. Setara dengan 2.000 ml."
      : "Contoh: 2.000 ml. Setara dengan 2 liter.";
  }

  function populateTargetForm() {
    const unit = state.settings.targetUnit === "l" ? "l" : "ml";
    state.targetEditorUnit = unit;
    els.targetAmount.value = editableTargetValue(state.settings.targetMl, unit);
    els.targetUnitRadios.forEach((radio) => {
      radio.checked = radio.value === unit;
    });
    updateTargetUnitUi(unit);
    clearTargetError();
  }

  function openSettings() {
    if (els.settingsDialog.open) return;
    populateTargetForm();
    updateStorageMeta();
    els.settingsDialog.showModal();
    syncModalState();
    window.setTimeout(() => {
      if (!els.settingsDialog.open) return;
      els.targetAmount.focus();
      els.targetAmount.select();
    }, 40);
  }

  function closeSettings() {
    if (els.settingsDialog.open) els.settingsDialog.close();
  }

  function openConfirm({ title, message, confirmLabel, onConfirm }) {
    confirmCallback = onConfirm;
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmActionButton.textContent = confirmLabel;
    if (!els.confirmDialog.open) els.confirmDialog.showModal();
    syncModalState();
    window.setTimeout(() => {
      if (els.confirmDialog.open) els.confirmCancelButton.focus();
    }, 40);
  }

  function handleTargetUnitChange(event) {
    if (!event.target.checked) return;
    const previousUnit = state.targetEditorUnit;
    const nextUnit = event.target.value;
    const parsedValue = parseLocalizedNumber(els.targetAmount.value);

    if (parsedValue !== null && parsedValue > 0) {
      const amountMl = previousUnit === "l" ? parsedValue * 1000 : parsedValue;
      els.targetAmount.value = editableTargetValue(amountMl, nextUnit);
    }

    clearTargetError();
    updateTargetUnitUi(nextUnit);
  }

  function handleTargetSubmit(event) {
    event.preventDefault();
    const now = Date.now();
    if (now - lastTargetSubmit < 350) return;

    clearTargetError();
    const rawValue = els.targetAmount.value.trim();
    if (!rawValue) {
      showTargetError("Masukkan jumlah target terlebih dahulu.");
      return;
    }

    const parsedValue = parseLocalizedNumber(rawValue);
    if (parsedValue === null || parsedValue <= 0) {
      showTargetError("Target harus berupa angka lebih dari 0.");
      return;
    }

    const selectedUnit = els.targetUnitRadios.find((radio) => radio.checked)?.value || "ml";
    const targetMl = Math.round(parsedValue * (selectedUnit === "l" ? 1000 : 1));

    if (targetMl <= 0) {
      showTargetError("Target minimal 1 ml.");
      return;
    }
    if (!Number.isSafeInteger(targetMl)) {
      showTargetError("Nilai target terlalu besar.");
      return;
    }

    lastTargetSubmit = now;
    state.settings.targetMl = targetMl;
    state.settings.targetUnit = selectedUnit;
    const saved = persistSettings();

    renderToday();
    renderSummary();
    closeSettings();

    showToast(
      saved
        ? `Target harian diperbarui menjadi ${formatMl(targetMl)}.`
        : `Target diperbarui di layar, tetapi browser gagal menyimpannya.`,
      { type: saved ? "success" : "error", icon: saved ? "check" : "alert", duration: saved ? 4000 : 7500 }
    );
  }

  function handleCustomUnitChange() {
    const previousUnit = state.settings.amountUnit;
    const nextUnit = els.customUnit.value === "l" ? "l" : "ml";
    const parsedValue = parseLocalizedNumber(els.customAmount.value);

    if (parsedValue !== null && parsedValue > 0) {
      const amountMl = previousUnit === "l" ? parsedValue * 1000 : parsedValue;
      if (nextUnit === "l") {
        els.customAmount.value = String(Number((amountMl / 1000).toFixed(3))).replace(".", ",");
      } else {
        els.customAmount.value = String(Math.round(amountMl));
      }
    }

    els.customAmount.placeholder = nextUnit === "l" ? "Contoh: 0,25" : "Contoh: 250";
    state.settings.amountUnit = nextUnit;
    clearCustomError();
    const saved = persistSettings();
    if (!saved) {
      showToast("Preferensi satuan tidak dapat disimpan oleh browser.", {
        type: "error",
        icon: "alert",
        duration: 6500
      });
    }
  }

  function handleCustomSubmit(event) {
    event.preventDefault();

    clearCustomError();
    const rawValue = els.customAmount.value.trim();
    if (!rawValue) {
      showCustomError("Masukkan jumlah air terlebih dahulu.");
      return;
    }

    const parsedValue = parseLocalizedNumber(rawValue);
    if (parsedValue === null || parsedValue <= 0) {
      showCustomError("Masukkan angka yang valid dan lebih dari 0.");
      return;
    }

    const selectedUnit = els.customUnit.value === "l" ? "l" : "ml";
    const amountMl = Math.round(parsedValue * (selectedUnit === "l" ? 1000 : 1));

    if (amountMl < 1) {
      showCustomError("Jumlah air minimal 1 ml.");
      return;
    }
    if (!Number.isSafeInteger(amountMl)) {
      showCustomError("Jumlah air terlalu besar.");
      return;
    }

    if (addWater(amountMl)) {
      els.customAmount.value = "";
      els.customAmount.focus();
    }
  }

  function guardQuickButton(button) {
    if (button.dataset.guarded === "true") return false;
    button.dataset.guarded = "true";
    window.setTimeout(() => button.removeAttribute("data-guarded"), 280);
    return true;
  }

  function focusAddSection() {
    const behavior = els.reduceMotion.matches ? "auto" : "smooth";
    els.addSection.scrollIntoView({ behavior, block: "center" });
    els.addSection.classList.add("is-highlighted");
    window.setTimeout(() => els.addSection.classList.remove("is-highlighted"), 950);
    window.setTimeout(() => {
      els.customAmount.focus({ preventScroll: true });
    }, els.reduceMotion.matches ? 0 : 320);
  }

  function navigateWeek(offset) {
    const nextDate = addDays(dateFromKey(state.chartAnchorKey), offset);
    const nextKey = localDateKey(nextDate);
    if (nextKey > state.todayKey) return;
    state.chartAnchorKey = nextKey;
    renderChart();
  }

  function resetHistoryData() {
    state.records = [];
    const saved = persistRecords();
    state.chartAnchorKey = state.todayKey;
    closeSettings();
    renderAll();
    showToast(
      saved ? "Seluruh riwayat minum telah dihapus. Target harian tetap tersimpan." : "Riwayat dihapus di layar, tetapi browser gagal menyimpannya.",
      { type: saved ? "success" : "error", icon: saved ? "trash" : "alert", duration: saved ? 4500 : 7500 }
    );
  }

  function resetAllData() {
    state.records = [];
    state.settings = { ...DEFAULT_SETTINGS };
    state.todayKey = localDateKey(new Date());
    state.chartAnchorKey = state.todayKey;

    const recordsRemoved = removeStorage(STORAGE_KEYS.records);
    const settingsRemoved = removeStorage(STORAGE_KEYS.settings);
    const demoMarkerKept = writeStorage(STORAGE_KEYS.demoSeed, new Date().toISOString());
    const saved = recordsRemoved && settingsRemoved && demoMarkerKept;

    els.customUnit.value = "ml";
    els.customAmount.value = "";
    els.customAmount.placeholder = "Contoh: 250";
    clearCustomError();
    closeSettings();
    renderAll();

    showToast(
      saved
        ? "Semua data Tetes telah direset ke pengaturan awal."
        : "Data direset di layar, tetapi sebagian data browser tidak dapat dihapus.",
      { type: saved ? "success" : "error", icon: saved ? "check" : "alert", duration: saved ? 4500 : 8000 }
    );
  }

  function requestResetHistory() {
    openConfirm({
      title: "Hapus seluruh riwayat minum?",
      message: "Semua catatan minum akan dihapus secara permanen. Target harian dan preferensi Anda tetap tersimpan.",
      confirmLabel: "Hapus riwayat",
      onConfirm: resetHistoryData
    });
  }

  function requestResetAll() {
    openConfirm({
      title: "Reset semua data Tetes?",
      message: "Riwayat minum, target harian, dan preferensi akan dikembalikan ke pengaturan awal. Tindakan ini tidak dapat dibatalkan.",
      confirmLabel: "Reset semua",
      onConfirm: resetAllData
    });
  }

  function bindEvents() {
    els.quickAddButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!guardQuickButton(button)) return;
        const amount = Number(button.dataset.amount);
        if (Number.isSafeInteger(amount) && amount > 0) addWater(amount);
      });
    });

    els.customForm.addEventListener("submit", handleCustomSubmit);
    els.customAmount.addEventListener("input", clearCustomError);
    els.customUnit.addEventListener("change", handleCustomUnitChange);
    els.emptyAddButton.addEventListener("click", focusAddSection);

    els.openSettingsButton.addEventListener("click", openSettings);
    els.targetButton.addEventListener("click", openSettings);
    els.closeSettingsButton.addEventListener("click", closeSettings);
    els.targetForm.addEventListener("submit", handleTargetSubmit);
    els.targetAmount.addEventListener("input", clearTargetError);
    els.targetUnitRadios.forEach((radio) => {
      radio.addEventListener("change", handleTargetUnitChange);
    });

    els.prevWeekButton.addEventListener("click", () => navigateWeek(-7));
    els.nextWeekButton.addEventListener("click", () => navigateWeek(7));

    els.resetHistoryButton.addEventListener("click", requestResetHistory);
    els.resetAllButton.addEventListener("click", requestResetAll);
    els.confirmCancelButton.addEventListener("click", () => els.confirmDialog.close());
    els.confirmActionButton.addEventListener("click", () => {
      const callback = confirmCallback;
      confirmCallback = null;
      els.confirmDialog.close();
      if (typeof callback === "function") callback();
    });

    [els.settingsDialog, els.confirmDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", () => {
        if (dialog === els.confirmDialog) confirmCallback = null;
        syncModalState();
      });
    });

    window.addEventListener("focus", () => syncToCurrentDate(true));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncToCurrentDate(true);
    });
    window.setInterval(() => syncToCurrentDate(true), 30000);
  }

  function init() {
    cacheElements();
    loadState();

    els.customUnit.value = state.settings.amountUnit === "l" ? "l" : "ml";
    els.customAmount.placeholder = state.settings.amountUnit === "l" ? "Contoh: 0,25" : "Contoh: 250";

    renderAll();
    bindEvents();

    window.setTimeout(() => {
      if (!state.storageAvailable) {
        showToast("Penyimpanan browser tidak dapat diakses. Data hanya bertahan selama halaman ini terbuka.", {
          type: "error",
          icon: "alert",
          duration: 8500
        });
      } else if (state.dataWarning) {
        showToast("Sebagian data lama tidak dapat dibaca dan telah diabaikan.", {
          type: "info",
          icon: "info",
          duration: 7000
        });
      } else if (state.demoLoaded) {
        showToast("Data contoh singkat telah dimuat agar tampilan langsung terisi.", {
          type: "info",
          icon: "info",
          duration: 6000
        });
      }
    }, 500);
  }

  init();
})();
