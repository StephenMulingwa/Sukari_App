/**
 * Load dashboard data: try published Google Sheet CSV, then fall back to data/data.json.
 */
(function (global) {
  var N = global.SukariNormalize;
  if (!N) {
    throw new Error("SukariNormalize required");
  }

  // Set to a gviz CSV URL when the sheet is shared "Anyone with the link can view"
  var SHEET_GVIZ_CSV =
    "https://docs.google.com/spreadsheets/d/1BLv58dB5wTyBMDMhTSAEMldxkdrdlib4ivErF_ok88s/gviz/tq?tqx=out:csv&gid=359531435";
  var LOCAL_JSON = "data/data.json";

  var MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  function parsePeriodStart(label) {
    if (!label) {
      return null;
    }
    var m = String(label).trim().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/i);
    if (!m) {
      return null;
    }
    var day = parseInt(m[1], 10);
    var monS = m[2].toLowerCase().slice(0, 3);
    var mon = MONTHS[monS];
    if (!mon) {
      return null;
    }
    var year = mon >= 10 ? 2025 : 2026;
    var last = new Date(year, mon, 0).getDate();
    day = Math.min(day, last);
    var d = new Date(year, mon - 1, day);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function parseCSVLine(line) {
    var out = [];
    var cur = "";
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        q = !q;
        continue;
      }
      if (!q && c === ",") {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  function parseCSV(text) {
    var lines = text.trim().split(/\r?\n/).filter(function (l) {
      return l.length;
    });
    if (!lines.length) {
      return [];
    }
    var headers = parseCSVLine(lines[0]).map(function (h) {
      return h.trim().replace(/^\uFEFF/, "");
    });
    var rows = [];
    for (var li = 1; li < lines.length; li++) {
      var cols = parseCSVLine(lines[li]);
      var obj = {};
      for (var ci = 0; ci < headers.length; ci++) {
        obj[headers[ci]] = cols[ci] != null ? cols[ci].trim() : "";
      }
      rows.push(obj);
    }
    return rows;
  }

  function rowFromSheet(obj) {
    var reg = obj["Registration No"] != null ? obj["Registration No"] : obj["registrationRaw"] || "";
    var typ = obj["Type"] != null ? obj["Type"] : obj["stolenType"] || "";
    var fuel = obj["Fuel Stolen (L)"] != null ? obj["Fuel Stolen (L)"] : obj["fuelLitres"];
    var dur = obj["Duration"] != null ? obj["Duration"] : obj["duration"] || "";
    return N.normalizeRow(reg, typ, parseFloat(String(fuel).replace(/,/g, "")) || 0, dur);
  }

  function buildPeriods(rows) {
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i].duration;
      if (d) {
        seen[d] = true;
      }
    }
    var labels = Object.keys(seen);
    labels.sort(function (a, b) {
      var sa = parsePeriodStart(a) || "9999";
      var sb = parsePeriodStart(b) || "9999";
      if (sa !== sb) {
        return sa < sb ? -1 : 1;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return labels.map(function (lab) {
      return { label: lab, sortKey: parsePeriodStart(lab) || lab };
    });
  }

  function loadLocalJson() {
    return fetch(LOCAL_JSON, { cache: "no-store" }).then(function (r) {
      if (!r.ok) {
        throw new Error("Failed to load " + LOCAL_JSON);
      }
      return r.json();
    });
  }

  function tryLoadSheet() {
    return fetch(SHEET_GVIZ_CSV, { mode: "cors", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("Sheet HTTP " + r.status);
        }
        return r.text();
      })
      .then(function (text) {
        if (text.indexOf("Sign in") !== -1 || text.indexOf("<!DOCTYPE") !== -1) {
          throw new Error("Sheet not public");
        }
        var raw = parseCSV(text);
        var rows = raw.map(rowFromSheet);
        return {
          meta: {
            source: "google_sheet",
            generated: new Date().toISOString(),
            rowCount: rows.length,
          },
          periods: buildPeriods(rows),
          rows: rows,
        };
      });
  }

  function loadData() {
    return tryLoadSheet().catch(function () {
      return loadLocalJson();
    });
  }

  global.SukariData = {
    loadData: loadData,
    loadLocalJson: loadLocalJson,
    parsePeriodStart: parsePeriodStart,
    buildPeriods: buildPeriods,
    SHEET_GVIZ_CSV: SHEET_GVIZ_CSV,
    LOCAL_JSON: LOCAL_JSON,
  };
})(typeof window !== "undefined" ? window : globalThis);
