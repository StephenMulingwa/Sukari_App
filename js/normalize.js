/**
 * Normalize raw spreadsheet rows (same rules as tools/build_data.py).
 */
(function (global) {
  var PLATE_SEQUENCES = [
    /\b([A-Z]{3,4})\s+(\d{2,3})\s*([A-Z])\b/i,
    /\b([A-Z]{3,4})_\S*\s+(\d{2,3})\s*([A-Z])\b/i,
    /\b([A-Z]{3,4})_(\d{2,3})\s*([A-Z])\b/i,
    /\b([A-Z]{3,4})[_\s]+(\d{2,3})\s*([A-Z])\b/i,
    /\b([A-Z]{3})\s+(\d{2,3})\s*([A-Z])\b/i,
  ];
  var PLATE_FALLBACK = /([A-Z]{3,4})[_\s]+(\d{2,3})[_\s]*([A-Z])/i;

  function parseDisplayReg(raw) {
    var s = String(raw || "");
    var m;
    for (var i = 0; i < PLATE_SEQUENCES.length; i++) {
      PLATE_SEQUENCES[i].lastIndex = 0;
      m = PLATE_SEQUENCES[i].exec(s);
      if (m) {
        return m[1].toUpperCase() + " " + m[2] + m[3].toUpperCase();
      }
    }
    m = PLATE_FALLBACK.exec(s);
    if (m) {
      return m[1].toUpperCase() + " " + m[2] + m[3].toUpperCase();
    }
    return s.length > 40 ? s.slice(0, 40) : s;
  }

  function classifyVehicleCategory(raw) {
    var t = String(raw || "").toUpperCase();
    var compact = t.replace(/[\s_]+/g, " ");
    if (t.indexOf("HARVEST") !== -1 && t.indexOf("BUS") !== -1) {
      return "Harvesting Bus";
    }
    if (t.indexOf("HAULMASTER") !== -1 || compact.indexOf("HAUL MASTER") !== -1) {
      return "Haulmaster";
    }
    if (t.indexOf("TRACTOR") !== -1) {
      return "Tractor";
    }
    if (t.indexOf("WINCH") !== -1) {
      return "Winch";
    }
    if (t.indexOf("TIPPER") !== -1) {
      return "Tipper";
    }
    if (t.indexOf("PRIME MOVER") !== -1 || compact.indexOf("PRIMEMOVER") !== -1 || t.indexOf("FAW") !== -1) {
      return "Prime Mover";
    }
    if (t.indexOf("SALES") !== -1) {
      return "Sales";
    }
    if (t.indexOf("HARVEST") !== -1) {
      return "Harvesting Bus";
    }
    return "Other";
  }

  function normalizeRow(registrationRaw, typeCol, fuelLitres, duration) {
    var raw = registrationRaw == null ? "" : String(registrationRaw);
    return {
      registrationRaw: raw,
      registration: parseDisplayReg(raw),
      vehicleCategory: classifyVehicleCategory(raw),
      stolenType: String(typeCol == null ? "" : typeCol).trim(),
      fuelLitres: typeof fuelLitres === "number" && !isNaN(fuelLitres) ? fuelLitres : parseFloat(fuelLitres) || 0,
      duration: String(duration == null ? "" : duration).trim(),
    };
  }

  global.SukariNormalize = {
    parseDisplayReg: parseDisplayReg,
    classifyVehicleCategory: classifyVehicleCategory,
    normalizeRow: normalizeRow,
  };
})(typeof window !== "undefined" ? window : globalThis);
