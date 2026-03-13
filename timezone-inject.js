// MAIN world injection script (document_start)
// Spoofs timezone, locale, navigator.language/languages, Date constructor
(function () {
  let tz = null;
  let spoofLocale = null;

  function applyConfig(raw) {
    try {
      const cfg = JSON.parse(raw);
      tz = cfg.timezone || null;
      spoofLocale = cfg.locale || null;
    } catch (e) {
      tz = raw;
    }
  }

  // Listen for config from content.js via custom event
  document.addEventListener("__clashconnect_tz", (e) => {
    applyConfig(e.detail);
    document.documentElement.removeAttribute("data-tz-override");
  });

  // Check if attribute was already set (in case ISOLATED ran first)
  const existing = document.documentElement.getAttribute("data-tz-override");
  if (existing) {
    applyConfig(existing);
    document.documentElement.removeAttribute("data-tz-override");
  }

  // ─── Navigator language spoofing ───────────────────────────────
  Object.defineProperty(Navigator.prototype, "language", {
    get() {
      return spoofLocale || undefined;
    },
    configurable: true
  });

  Object.defineProperty(Navigator.prototype, "languages", {
    get() {
      if (!spoofLocale) return undefined;
      const base = spoofLocale.split("-")[0];
      return base !== spoofLocale ? [spoofLocale, base] : [spoofLocale];
    },
    configurable: true
  });

  // ─── Save original references ─────────────────────────────────
  const OrigDate = Date;
  const OrigDTF = Intl.DateTimeFormat;
  const OrigNumberFormat = Intl.NumberFormat;
  const OrigPluralRules = Intl.PluralRules;
  const origGetTZOffset = OrigDate.prototype.getTimezoneOffset;

  // ─── Intl locale patching ─────────────────────────────────────
  function patchLocaleDefault(OrigConstructor, name) {
    function Patched(locales, options) {
      if (!(this instanceof Patched)) {
        return new Patched(locales, options);
      }
      if (!locales && spoofLocale) locales = spoofLocale;
      return new OrigConstructor(locales, options);
    }
    Patched.prototype = OrigConstructor.prototype;
    if (OrigConstructor.supportedLocalesOf) {
      Patched.supportedLocalesOf =
        OrigConstructor.supportedLocalesOf.bind(OrigConstructor);
    }
    Object.defineProperty(Patched, "name", { value: name });
    return Patched;
  }

  Intl.NumberFormat = patchLocaleDefault(OrigNumberFormat, "NumberFormat");
  Intl.PluralRules = patchLocaleDefault(OrigPluralRules, "PluralRules");

  // ─── Timezone helpers ─────────────────────────────────────────
  // Compute offset in minutes (UTC - local) for the spoofed timezone
  function getOffsetForTZ(date) {
    if (!tz) return null;
    try {
      const utcParts = new OrigDTF("en-US", {
        timeZone: "UTC",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
      }).formatToParts(date);

      const tzParts = new OrigDTF("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
      }).formatToParts(date);

      function extract(parts) {
        const p = {};
        parts.forEach((v) => { p[v.type] = parseInt(v.value, 10); });
        return OrigDate.UTC(
          p.year, p.month - 1, p.day,
          p.hour === 24 ? 0 : p.hour, p.minute, p.second
        );
      }

      return (extract(utcParts) - extract(tzParts)) / 60000;
    } catch (e) {
      return null;
    }
  }

  function getTZAbbr(date) {
    if (!tz) return null;
    try {
      const str = new OrigDTF("en-US", {
        timeZone: tz,
        timeZoneName: "short"
      }).format(date);
      const match = str.match(/\s([A-Z]{2,5}|[+-]\d{2}:\d{2}|GMT[+-]\d+)$/);
      return match ? match[1] : tz;
    } catch (e) {
      return tz;
    }
  }

  // ─── Date constructor override ────────────────────────────────
  // When called with 2+ args (year, month, ...), JS interprets them
  // in the REAL local timezone. We re-interpret in the spoofed timezone.
  function PatchedDate(...args) {
    const isNew = new.target !== undefined;

    // Date() without new always returns current time as string
    if (!isNew) {
      return new OrigDate().toString();
    }

    // 0 args: current time — no timezone interpretation
    if (args.length === 0 || !tz) {
      return new OrigDate(...args);
    }

    // 1 arg: could be milliseconds (number) or date string
    if (args.length === 1) {
      if (typeof args[0] === "number") {
        // Milliseconds since epoch — no TZ interpretation needed
        return new OrigDate(args[0]);
      }
      if (typeof args[0] === "string") {
        // String parsing: JS interprets strings without explicit timezone
        // in the REAL local timezone. We need to adjust.
        // Strings with explicit TZ indicators should NOT be adjusted.
        const str = args[0];
        const hasExplicitTZ = /Z|[+-]\d{2}:\d{2}|[+-]\d{4}|GMT|UTC/i.test(str);
        if (hasExplicitTZ) {
          return new OrigDate(str);
        }
        // Parse in real TZ, then adjust to spoofed TZ
        const realDate = new OrigDate(str);
        if (isNaN(realDate.getTime())) return realDate; // invalid date
        const realOffset = origGetTZOffset.call(realDate);
        const spoofOffset = getOffsetForTZ(realDate);
        if (spoofOffset === null) return realDate;
        // Adjust: move from real-TZ interpretation to spoofed-TZ
        const adjusted = new OrigDate(realDate.getTime() + (spoofOffset - realOffset) * 60000);
        // Refine for DST boundary
        const refinedOffset = getOffsetForTZ(adjusted);
        if (refinedOffset !== null && refinedOffset !== spoofOffset) {
          return new OrigDate(realDate.getTime() + (refinedOffset - realOffset) * 60000);
        }
        return adjusted;
      }
      // Date object or other — pass through
      return new OrigDate(args[0]);
    }

    // 2+ args: (year, month, day?, hours?, min?, sec?, ms?)
    // These are interpreted in local time. We need to reinterpret in spoofed TZ.
    // Strategy:
    //   1. Compute UTC ms as if the args were UTC
    //   2. Add the spoofed TZ offset to get the correct UTC timestamp
    //      (because local = UTC - offset, so UTC = local_as_utc + offset)
    const asUtc = OrigDate.UTC(...args);

    // Get the spoofed offset at approximately this time
    // (use a temp date at the UTC interpretation to find the offset)
    const tempDate = new OrigDate(asUtc);
    const spoofedOffset = getOffsetForTZ(tempDate);
    if (spoofedOffset === null) {
      return new OrigDate(...args);
    }

    // local_as_utc + offset * 60000 = correct UTC timestamp
    const corrected = asUtc + spoofedOffset * 60000;

    // Refine: the offset might differ at the corrected time (DST boundary)
    const refinedDate = new OrigDate(corrected);
    const refinedOffset = getOffsetForTZ(refinedDate);
    if (refinedOffset !== null && refinedOffset !== spoofedOffset) {
      return new OrigDate(asUtc + refinedOffset * 60000);
    }

    return refinedDate;
  }

  // Copy all static methods and properties
  PatchedDate.prototype = OrigDate.prototype;
  PatchedDate.now = OrigDate.now;
  PatchedDate.parse = function (str) {
    // Date.parse has the same local-TZ interpretation issue for strings
    // without explicit timezone. Route through our patched constructor.
    if (typeof str === "string" && tz) {
      const d = new PatchedDate(str);
      return d.getTime();
    }
    return OrigDate.parse(str);
  };
  PatchedDate.UTC = OrigDate.UTC;
  Object.defineProperty(PatchedDate, "name", { value: "Date" });
  Object.defineProperty(PatchedDate, "length", { value: 7 });

  // Ensure instanceof works
  Object.defineProperty(PatchedDate.prototype, "constructor", {
    value: PatchedDate,
    writable: true,
    configurable: true
  });

  // Replace global Date
  Date = PatchedDate;

  // ─── Intl.DateTimeFormat override ─────────────────────────────
  function PatchedDTF(locales, options) {
    if (!(this instanceof PatchedDTF)) {
      return new PatchedDTF(locales, options);
    }
    if (!locales && spoofLocale) locales = spoofLocale;
    const opts = Object.assign({}, options || {});
    if (!opts.timeZone && tz) opts.timeZone = tz;
    return new OrigDTF(locales, opts);
  }

  PatchedDTF.prototype = OrigDTF.prototype;
  PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf.bind(OrigDTF);
  Object.defineProperty(PatchedDTF, "name", { value: "DateTimeFormat" });
  Intl.DateTimeFormat = PatchedDTF;

  const origResolved = OrigDTF.prototype.resolvedOptions;
  OrigDTF.prototype.resolvedOptions = function () {
    const result = origResolved.call(this);
    if (tz) result.timeZone = tz;
    if (spoofLocale) result.locale = spoofLocale;
    return result;
  };

  // ─── Date.prototype overrides ─────────────────────────────────
  OrigDate.prototype.getTimezoneOffset = function () {
    const offset = getOffsetForTZ(this);
    return offset !== null ? offset : origGetTZOffset.call(this);
  };

  const origToString = OrigDate.prototype.toString;
  OrigDate.prototype.toString = function () {
    if (!tz) return origToString.call(this);
    const offset = getOffsetForTZ(this);
    if (offset === null) return origToString.call(this);
    const sign = offset <= 0 ? "+" : "-";
    const absOff = Math.abs(offset);
    const hh = String(Math.floor(absOff / 60)).padStart(2, "0");
    const mm = String(absOff % 60).padStart(2, "0");
    const abbr = getTZAbbr(this);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const parts = new OrigDTF("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      weekday: "short", hour12: false
    }).formatToParts(this);
    const p = {};
    parts.forEach((v) => { p[v.type] = v.value; });
    const hour = p.hour === "24" ? "00" : p.hour;
    return `${p.weekday} ${months[parseInt(p.month, 10) - 1]} ${p.day} ${p.year} ${hour}:${p.minute}:${p.second} GMT${sign}${hh}${mm} (${abbr})`;
  };

  const origToTimeString = OrigDate.prototype.toTimeString;
  OrigDate.prototype.toTimeString = function () {
    if (!tz) return origToTimeString.call(this);
    const offset = getOffsetForTZ(this);
    if (offset === null) return origToTimeString.call(this);
    const sign = offset <= 0 ? "+" : "-";
    const absOff = Math.abs(offset);
    const hh = String(Math.floor(absOff / 60)).padStart(2, "0");
    const mm = String(absOff % 60).padStart(2, "0");
    const abbr = getTZAbbr(this);
    const parts = new OrigDTF("en-US", {
      timeZone: tz,
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    }).formatToParts(this);
    const p = {};
    parts.forEach((v) => { p[v.type] = v.value; });
    const hour = p.hour === "24" ? "00" : p.hour;
    return `${hour}:${p.minute}:${p.second} GMT${sign}${hh}${mm} (${abbr})`;
  };

  const origToDateString = OrigDate.prototype.toDateString;
  OrigDate.prototype.toDateString = function () {
    if (!tz) return origToDateString.call(this);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    try {
      const parts = new OrigDTF("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        weekday: "short"
      }).formatToParts(this);
      const p = {};
      parts.forEach((v) => { p[v.type] = v.value; });
      return `${p.weekday} ${months[parseInt(p.month, 10) - 1]} ${p.day} ${p.year}`;
    } catch (e) {
      return origToDateString.call(this);
    }
  };

  // Override locale methods
  const localeMethods = [
    "toLocaleString",
    "toLocaleDateString",
    "toLocaleTimeString"
  ];
  localeMethods.forEach((method) => {
    const orig = OrigDate.prototype[method];
    OrigDate.prototype[method] = function (locales, options) {
      if (!locales && spoofLocale) locales = spoofLocale;
      const opts = Object.assign({}, options || {});
      if (!opts.timeZone && tz) opts.timeZone = tz;
      return orig.call(this, locales, opts);
    };
  });

  // Override getters that return local-time components
  // These read from the internal UTC timestamp and apply the REAL offset,
  // so we need to redirect them through the spoofed timezone
  const dateGetters = [
    "getFullYear", "getMonth", "getDate", "getDay",
    "getHours", "getMinutes", "getSeconds"
  ];
  const dtfOptionsForGetter = {
    getFullYear: { year: "numeric" },
    getMonth:    { month: "numeric" },
    getDate:     { day: "numeric" },
    getDay:      { weekday: "short" },
    getHours:    { hour: "numeric", hour12: false },
    getMinutes:  { minute: "numeric" },
    getSeconds:  { second: "numeric" }
  };
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  dateGetters.forEach((method) => {
    const orig = OrigDate.prototype[method];
    OrigDate.prototype[method] = function () {
      if (!tz) return orig.call(this);
      try {
        const opts = Object.assign({ timeZone: tz }, dtfOptionsForGetter[method]);
        const parts = new OrigDTF("en-US", opts).formatToParts(this);
        const val = parts.find((p) =>
          p.type !== "literal"
        );
        if (method === "getDay") {
          return dayMap[val.value] ?? orig.call(this);
        }
        const n = parseInt(val.value, 10);
        if (method === "getMonth") return n - 1; // JS months are 0-indexed
        if (method === "getHours" && n === 24) return 0;
        return n;
      } catch (e) {
        return orig.call(this);
      }
    };
  });

  // ─── Geolocation override ────────────────────────────────────
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function (success, error) {
      if (error) {
        error({
          code: 1,
          message: "User denied Geolocation",
          PERMISSION_DENIED: 1
        });
      }
    };
    navigator.geolocation.watchPosition = function (success, error) {
      if (error) {
        error({
          code: 1,
          message: "User denied Geolocation",
          PERMISSION_DENIED: 1
        });
      }
      return 0;
    };
  }
})();
