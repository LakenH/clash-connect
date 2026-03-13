// Content script (ISOLATED world, document_start)
// Reads spoofing settings from chrome.storage and passes to MAIN world
(function () {
  chrome.storage.local.get(
    ["timezoneEnabled", "timezone", "locale"],
    (data) => {
      if (data.timezoneEnabled && data.timezone) {
        const payload = JSON.stringify({
          timezone: data.timezone,
          locale: data.locale || null
        });
        // Set DOM attribute as fallback
        document.documentElement.setAttribute("data-tz-override", payload);
        // Dispatch custom event for the MAIN world script
        document.dispatchEvent(
          new CustomEvent("__clashconnect_tz", { detail: payload })
        );
      }
    }
  );
})();
