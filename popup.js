const proxyToggle = document.getElementById("proxyToggle");
const tzToggle = document.getElementById("tzToggle");
const statusSection = document.getElementById("statusSection");
const exitIPEl = document.getElementById("exitIP");
const locationEl = document.getElementById("location");
const timezoneEl = document.getElementById("timezone");
const errorBox = document.getElementById("errorBox");
const spinner = document.getElementById("spinner");
const settingsToggleBtn = document.getElementById("settingsToggle");
const settingsSection = document.getElementById("settingsSection");
const proxyHostInput = document.getElementById("proxyHost");
const proxyPortInput = document.getElementById("proxyPort");
const bypassListInput = document.getElementById("bypassList");
const saveSettingsBtn = document.getElementById("saveSettings");
const saveStatus = document.getElementById("saveStatus");
const refreshBtn = document.getElementById("refreshBtn");
const localeEl = document.getElementById("locale");
const iconColorSelect = document.getElementById("iconColor");

// i18n helper
function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

// Apply translations to all elements with data-i18n
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
}

function countryCodeToFlag(cc) {
  if (!cc) return "";
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

function showSpinner() {
  spinner.classList.remove("hidden");
}

function hideSpinner() {
  spinner.classList.add("hidden");
}

function updateStatusUI(data) {
  if (data.proxyEnabled && data.exitIP) {
    statusSection.classList.remove("hidden");
    exitIPEl.textContent = data.exitIP;
    locationEl.textContent =
      `${countryCodeToFlag(data.countryCode)} ${data.country || "Unknown"}`;
    timezoneEl.textContent = data.timezone || "—";
    localeEl.textContent = data.locale || "—";
  } else {
    statusSection.classList.add("hidden");
  }

  if (data.proxyError) {
    showError(data.proxyError);
  } else {
    hideError();
  }
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

// Load initial state
async function init() {
  applyI18n();

  const status = await sendMessage({ action: "getStatus" });
  if (!status) return;

  proxyToggle.checked = status.proxyEnabled;
  tzToggle.checked = status.timezoneEnabled;
  proxyHostInput.value = status.proxyHost || "127.0.0.1";
  proxyPortInput.value = status.proxyPort || 7890;
  bypassListInput.value = (status.bypassList || []).join("\n");
  iconColorSelect.value = status.iconColor || "dark";

  updateStatusUI(status);
}

// Proxy toggle
proxyToggle.addEventListener("change", async () => {
  hideError();
  if (proxyToggle.checked) {
    showSpinner();
    const result = await sendMessage({ action: "enableProxy" });
    hideSpinner();
    if (result && result.success) {
      updateStatusUI(result);
    } else {
      proxyToggle.checked = false;
      showError(t("failedEnable"));
    }
  } else {
    await sendMessage({ action: "disableProxy" });
    statusSection.classList.add("hidden");
    hideError();
  }
});

// Timezone toggle
tzToggle.addEventListener("change", async () => {
  const enabled = tzToggle.checked;
  await sendMessage({ action: "toggleTimezone", enabled });
});

// Refresh IP/timezone/locale
refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = t("refreshing");
  const result = await sendMessage({ action: "refreshIP" });
  if (result && result.success) {
    updateStatusUI({ proxyEnabled: true, ...result });
  } else {
    showError(t("refreshFailed"));
  }
  refreshBtn.disabled = false;
  refreshBtn.textContent = t("refresh");
});

// Icon color
iconColorSelect.addEventListener("change", async () => {
  await sendMessage({ action: "setIconColor", color: iconColorSelect.value });
});

// Settings toggle
settingsToggleBtn.addEventListener("click", () => {
  const hidden = settingsSection.classList.toggle("hidden");
  settingsToggleBtn.textContent = hidden ? t("settingsExpand") : t("settingsCollapse");
});

// Save settings
saveSettingsBtn.addEventListener("click", async () => {
  const host = proxyHostInput.value.trim() || "127.0.0.1";
  const port = parseInt(proxyPortInput.value) || 7890;
  const bypassList = bypassListInput.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  await sendMessage({ action: "updateSettings", host, port, bypassList });

  saveStatus.classList.remove("hidden");
  setTimeout(() => saveStatus.classList.add("hidden"), 1500);
});

init();
