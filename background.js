const DEFAULTS = {
  proxyEnabled: false,
  timezoneEnabled: false,
  proxyHost: "127.0.0.1",
  proxyPort: 7890,
  bypassList: ["localhost", "127.0.0.1", "<local>"],
  exitIP: null,
  country: null,
  countryCode: null,
  timezone: null,
  locale: null,
  iconColor: "dark"
};

// Map country codes to primary locale (BCP 47 language tag)
const COUNTRY_LOCALE_MAP = {
  US: "en-US", GB: "en-GB", AU: "en-AU", CA: "en-CA", NZ: "en-NZ",
  IE: "en-IE", ZA: "en-ZA", IN: "hi-IN", JP: "ja-JP", KR: "ko-KR",
  CN: "zh-CN", TW: "zh-TW", HK: "zh-HK", DE: "de-DE", AT: "de-AT",
  CH: "de-CH", FR: "fr-FR", BE: "fr-BE", ES: "es-ES", MX: "es-MX",
  AR: "es-AR", CO: "es-CO", CL: "es-CL", PE: "es-PE", VE: "es-VE",
  BR: "pt-BR", PT: "pt-PT", IT: "it-IT", NL: "nl-NL", PL: "pl-PL",
  RU: "ru-RU", UA: "uk-UA", TR: "tr-TR", SA: "ar-SA", AE: "ar-AE",
  EG: "ar-EG", TH: "th-TH", VN: "vi-VN", ID: "id-ID", MY: "ms-MY",
  PH: "en-PH", SG: "en-SG", SE: "sv-SE", NO: "nb-NO", DK: "da-DK",
  FI: "fi-FI", CZ: "cs-CZ", RO: "ro-RO", HU: "hu-HU", GR: "el-GR",
  IL: "he-IL", NG: "en-NG", KE: "en-KE", PK: "ur-PK", BD: "bn-BD",
  LK: "si-LK", NP: "ne-NP", MM: "my-MM", KH: "km-KH", LA: "lo-LA"
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (data) => {
    const merged = { ...DEFAULTS, ...data };
    chrome.storage.local.set(merged, () => {
      if (merged.proxyEnabled) {
        applyProxy(merged.proxyHost, merged.proxyPort, merged.bypassList);
        setIcon(merged.proxyError ? "red" : "green");
        setBadge(merged.countryCode);
      }
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(null, (data) => {
    if (data.proxyEnabled) {
      applyProxy(data.proxyHost, data.proxyPort, data.bypassList);
      setIcon(data.proxyError ? "red" : "green");
      setBadge(data.countryCode);
    }
  });
});

function applyProxy(host, port, bypassList) {
  const config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "socks5",
        host: host,
        port: parseInt(port)
      },
      bypassList: bypassList || []
    }
  };
  chrome.proxy.settings.set({ value: config, scope: "regular" });
  // Force WebRTC through proxy to prevent IP leak
  chrome.privacy.network.webRTCIPHandlingPolicy.set({
    value: "disable_non_proxied_udp"
  });
}

function clearProxy() {
  chrome.proxy.settings.set({ value: { mode: "direct" }, scope: "regular" });
  // Restore default WebRTC behavior
  chrome.privacy.network.webRTCIPHandlingPolicy.set({
    value: "default"
  });
}

// Icon state: "default" (cat), "green" (connected), "red" (error)
// Color: "dark" or "white"
async function setIcon(state) {
  const data = await chrome.storage.local.get("iconColor");
  const color = data.iconColor || "dark";
  const colorPrefix = color === "white" ? "-white" : "";
  const stateSuffix = state === "default" ? "" : `-${state}`;
  // dark: icon16.png, icon16-green.png, icon16-red.png
  // white: icon16-white.png, icon16-white-green.png, icon16-white-red.png
  chrome.action.setIcon({
    path: {
      16: `icons/icon16${colorPrefix}${stateSuffix}.png`,
      48: `icons/icon48${colorPrefix}${stateSuffix}.png`,
      128: `icons/icon128${colorPrefix}${stateSuffix}.png`
    }
  });
}

function countryCodeToFlag(cc) {
  if (!cc) return "";
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function setBadge(countryCode) {
  const flag = countryCodeToFlag(countryCode);
  chrome.action.setBadgeText({ text: flag || "" });
  chrome.action.setBadgeBackgroundColor({ color: "#00000000" });
}

async function fetchExitIP() {
  try {
    const resp = await fetch(
      "http://ip-api.com/json/?fields=query,country,countryCode,timezone"
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const locale = COUNTRY_LOCALE_MAP[data.countryCode] ||
      `en-${data.countryCode}`;
    return {
      exitIP: data.query,
      country: data.country,
      countryCode: data.countryCode,
      timezone: data.timezone,
      locale: locale
    };
  } catch (e) {
    console.error("IP lookup failed:", e);
    return null;
  }
}

chrome.proxy.onProxyError.addListener((details) => {
  console.error("Proxy error:", details);
  chrome.storage.local.set({ proxyError: details.error });
  setIcon("red");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse);
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  const data = await chrome.storage.local.get(null);

  switch (msg.action) {
    case "getStatus":
      return {
        proxyEnabled: data.proxyEnabled,
        timezoneEnabled: data.timezoneEnabled,
        proxyHost: data.proxyHost,
        proxyPort: data.proxyPort,
        bypassList: data.bypassList,
        exitIP: data.exitIP,
        country: data.country,
        countryCode: data.countryCode,
        timezone: data.timezone,
        locale: data.locale,
        proxyError: data.proxyError || null,
        iconColor: data.iconColor || "dark"
      };

    case "enableProxy": {
      applyProxy(data.proxyHost, data.proxyPort, data.bypassList);
      const updates = { proxyEnabled: true, proxyError: null };
      const ipData = await fetchExitIP();
      if (ipData) {
        Object.assign(updates, ipData);
        setIcon("green");
        setBadge(ipData.countryCode);
      } else {
        setIcon("red");
        setBadge(null);
      }
      await chrome.storage.local.set(updates);
      return { success: true, ...updates };
    }

    case "disableProxy": {
      clearProxy();
      setIcon("default");
      setBadge(null);
      await chrome.storage.local.set({
        proxyEnabled: false,
        exitIP: null,
        country: null,
        countryCode: null,
        timezone: null,
        locale: null,
        proxyError: null
      });
      return { success: true };
    }

    case "toggleTimezone": {
      const enabled = msg.enabled;
      await chrome.storage.local.set({ timezoneEnabled: enabled });
      return { success: true, timezoneEnabled: enabled };
    }

    case "refreshIP": {
      const ipData = await fetchExitIP();
      if (ipData) {
        await chrome.storage.local.set(ipData);
        setBadge(ipData.countryCode);
        return { success: true, ...ipData };
      }
      return { success: false, error: "IP lookup failed" };
    }

    case "setIconColor": {
      const iconColor = msg.color === "white" ? "white" : "dark";
      await chrome.storage.local.set({ iconColor });
      // Re-apply icon with current state
      if (data.proxyEnabled) {
        setIcon(data.proxyError ? "red" : "green");
      } else {
        setIcon("default");
      }
      return { success: true, iconColor };
    }

    case "updateSettings": {
      const updates = {};
      if (msg.host !== undefined) updates.proxyHost = msg.host;
      if (msg.port !== undefined) updates.proxyPort = parseInt(msg.port);
      if (msg.bypassList !== undefined) updates.bypassList = msg.bypassList;
      await chrome.storage.local.set(updates);
      // Re-apply proxy if currently active
      if (data.proxyEnabled) {
        const merged = { ...data, ...updates };
        applyProxy(merged.proxyHost, merged.proxyPort, merged.bypassList);
      }
      return { success: true };
    }

    default:
      return { error: "Unknown action" };
  }
}
