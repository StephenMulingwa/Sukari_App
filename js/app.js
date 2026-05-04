(function () {
  var D = window.SukariData;
  var F = window.SukariFilters;
  var C = window.SukariCharts;

  var payload = null;
  var filterState = F.createState();
  var vehicleSort = { key: "fuelLitres", dir: -1 };

  function $(id) {
    return document.getElementById(id);
  }

  function formatNum(n, d) {
    d = d || 1;
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  function getFiltered() {
    return F.filterRows(payload.rows, filterState);
  }

  function buildInsights(rows) {
    var lines = [];
    if (!rows.length) {
      lines.push("No incidents match the current filters.");
      return lines;
    }
    var total = F.totalLitres(rows);
    var byCat = F.aggregateByCategory(rows);
    var top = byCat[0];
    if (top) {
      lines.push(
        "Highest fuel loss is in the **" +
          top.category +
          "** category (~" +
          formatNum((top.fuelLitres / total) * 100, 0) +
          "% of filtered litres)."
      );
    }
    var directL = 0;
    var retL = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].stolenType === "Direct Theft") {
        directL += rows[i].fuelLitres;
      }
      if (rows[i].stolenType === "Return pipe") {
        retL += rows[i].fuelLitres;
      }
    }
    if (directL + retL > 0) {
      lines.push(
        "**Direct Theft** accounts for " +
          formatNum((directL / (directL + retL)) * 100, 0) +
          "% of stolen litres in this slice; **Return pipe** accounts for " +
          formatNum((retL / (directL + retL)) * 100, 0) +
          "%."
      );
    }
    var byPeriod = {};
    for (var j = 0; j < rows.length; j++) {
      var d = rows[j].duration;
      if (!byPeriod[d]) {
        byPeriod[d] = 0;
      }
      byPeriod[d] += rows[j].fuelLitres;
    }
    var pmax = null;
    var vmax = -1;
    for (var p in byPeriod) {
      if (byPeriod[p] > vmax) {
        vmax = byPeriod[p];
        pmax = p;
      }
    }
    if (pmax) {
      lines.push("Peaks in this view: **" + pmax + "** with **" + formatNum(vmax, 1) + " L** total.");
    }
    var tab = F.crossTabLitres(rows);
    var bestMix = null;
    var bestRatio = -1;
    for (var ci = 0; ci < tab.categories.length; ci++) {
      var cat = tab.categories[ci];
      var d = 0;
      var r = 0;
      for (var ti = 0; ti < tab.stolenTypes.length; ti++) {
        var st = tab.stolenTypes[ti];
        var v = (tab.grid[st] && tab.grid[st][cat]) || 0;
        if (st === "Direct Theft") {
          d += v;
        }
        if (st === "Return pipe") {
          r += v;
        }
      }
      if (d + r > 1) {
        var ratio = r / (d + r);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestMix = cat;
        }
      }
    }
    if (bestMix && bestRatio > 0.35) {
      lines.push(
        "**" +
          bestMix +
          "** shows a larger share of **Return pipe**-linked losses in this slice — worth reviewing return-line hardware on that fleet."
      );
    }
    return lines;
  }

  function renderMarkdownLite(line) {
    return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function updateInsights(rows) {
    var ul = $("insightList");
    if (!ul) {
      return;
    }
    var lines = buildInsights(rows);
    ul.innerHTML = lines
      .map(function (line) {
        return '<li class="leading-relaxed">' + renderMarkdownLite(line) + "</li>";
      })
      .join("");
  }

  function periodTableBody(rows) {
    var byPeriod = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!byPeriod[r.duration]) {
        byPeriod[r.duration] = { litres: 0, incidents: 0 };
      }
      byPeriod[r.duration].litres += r.fuelLitres;
      byPeriod[r.duration].incidents += 1;
    }
    var labels = Object.keys(byPeriod).sort(function (a, b) {
      var sa = D.parsePeriodStart(a) || "9999";
      var sb = D.parsePeriodStart(b) || "9999";
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
    return labels
      .map(function (lab) {
        var x = byPeriod[lab];
        return (
          "<tr class=\"border-b border-slate-100 hover:bg-emerald-50/40\"><td class=\"py-3 pr-4\">" +
          escapeHtml(lab) +
          '</td><td class="py-3 text-right">' +
          x.incidents +
          '</td><td class="py-3 text-right font-medium text-emerald-800">' +
          formatNum(x.litres, 2) +
          " L</td></tr>"
        );
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updatePeriodBreakdown(rows) {
    var tb = $("periodBreakdownBody");
    if (!tb) {
      return;
    }
    tb.innerHTML = periodTableBody(rows);
  }

  function updateKpis(rows) {
    var total = F.totalLitres(rows);
    var incidents = rows.length;
    var byCat = F.aggregateByCategory(rows);
    var topCat = byCat.length ? byCat[0] : null;
    var direct = 0;
    var totTyped = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].stolenType === "Direct Theft") {
        direct += rows[i].fuelLitres;
      }
      if (rows[i].stolenType === "Direct Theft" || rows[i].stolenType === "Return pipe") {
        totTyped += rows[i].fuelLitres;
      }
    }
    var directPct = totTyped > 0 ? (direct / totTyped) * 100 : 0;

    if ($("kpiTotalLitres")) $("kpiTotalLitres").textContent = formatNum(total, 1) + " L";
    if ($("kpiIncidents")) $("kpiIncidents").textContent = String(incidents);
    if ($("kpiMostAffected")) {
      $("kpiMostAffected").textContent = topCat ? topCat.category : "—";
      if ($("kpiMostAffectedSub")) {
        $("kpiMostAffectedSub").textContent = topCat
          ? formatNum(topCat.fuelLitres, 1) + " L • " + topCat.incidents + " incidents"
          : "";
      }
    }
    if ($("kpiDirectPct")) $("kpiDirectPct").textContent = formatNum(directPct, 0) + "%";

    var byReg = F.aggregateByReg(rows);
    byReg.sort(function (a, b) {
      return b.fuelLitres - a.fuelLitres;
    });
    if ($("kpiTopReg")) {
      var tr = byReg[0];
      $("kpiTopReg").textContent = tr ? tr.registration : "—";
      if ($("kpiTopRegSub")) {
        $("kpiTopRegSub").textContent = tr ? formatNum(tr.fuelLitres, 1) + " L" : "";
      }
    }
  }

  function compareVehicle(a, b) {
    var k = vehicleSort.key;
    var mul = vehicleSort.dir;
    var va = a[k];
    var vb = b[k];
    if (va == null || vb == null) {
      return 0;
    }
    if (typeof va === "string") {
      return va.localeCompare(vb) * mul;
    }
    return va > vb ? mul : va < vb ? -mul : 0;
  }

  function updateVehiclesTable(rows) {
    var tbody = $("vehiclesTableBody");
    if (!tbody) {
      return;
    }
    var agg = F.aggregateByReg(rows);
    var total = F.totalLitres(rows);
    agg.sort(compareVehicle);
    tbody.innerHTML = agg
      .map(function (r) {
        var pct = total > 0 ? (r.fuelLitres / total) * 100 : 0;
        return (
          "<tr class=\"border-b border-slate-100 hover:bg-emerald-50/50\"><td class=\"py-4 font-medium text-slate-800\">" +
          escapeHtml(r.registration) +
          '</td><td class="py-4 text-slate-600">' +
          escapeHtml(r.vehicleCategory) +
          '</td><td class="py-4 text-center">' +
          r.incidents +
          '</td><td class="py-4 text-right font-semibold text-emerald-800">' +
          formatNum(r.fuelLitres, 2) +
          '</td><td class="py-4 text-right text-slate-500">' +
          formatNum(pct, 1) +
          "%</td></tr>"
        );
      })
      .join("");
    if (!agg.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="py-10 text-center text-slate-500">No rows match the filters.</td></tr>';
    }
  }

  function bindSortHeaders() {
    ["registration", "vehicleCategory", "incidents", "fuelLitres", "pct"].forEach(function (key) {
      var el = $("sort_" + key);
      if (!el) {
        return;
      }
      el.addEventListener("click", function () {
        if (vehicleSort.key === key) {
          vehicleSort.dir = -vehicleSort.dir;
        } else {
          vehicleSort.key = key;
          vehicleSort.dir = key === "registration" || key === "vehicleCategory" ? 1 : -1;
        }
        updateVehiclesTable(getFiltered());
      });
    });
  }

  function readCategoryChecks() {
    var boxes = document.querySelectorAll('input[name="cat"]:checked');
    var all = document.querySelectorAll('input[name="cat"]');
    if (boxes.length === all.length) {
      return null;
    }
    var set = new Set();
    boxes.forEach(function (b) {
      set.add(b.value);
    });
    return set;
  }

  function applyFiltersAndRender() {
    filterState.period = $("filterPeriod") ? $("filterPeriod").value : "all";
    filterState.stolenType = $("filterStolen") ? $("filterStolen").value : "all";
    filterState.registration = $("filterReg") ? $("filterReg").value.trim() : "";
    filterState.categories = readCategoryChecks();

    var rows = getFiltered();
    var periodDefs = payload.periods || [];

    updateKpis(rows);
    C.updateOverview(periodDefs, rows, rows);
    C.updateInvestigation(periodDefs, rows);
    var split = $("trendsSplit") ? $("trendsSplit").value : "total";
    C.updateTrends(periodDefs, rows, split);
    updateVehiclesTable(rows);
    updateInsights(rows);
    updatePeriodBreakdown(rows);

    if ($("reportRowCount")) {
      $("reportRowCount").textContent = String(rows.length);
    }
  }

  function exportCsv() {
    var rows = getFiltered();
    var cols = ["registration", "vehicleCategory", "stolenType", "fuelLitres", "duration", "registrationRaw"];
    var header = ["Registration", "Vehicle category", "Stolen type", "Fuel stolen (L)", "Period", "Registration raw"];
    var lines = [header.join(",")];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var line = [
        csvEscape(r.registration),
        csvEscape(r.vehicleCategory),
        csvEscape(r.stolenType),
        r.fuelLitres,
        csvEscape(r.duration),
        csvEscape(r.registrationRaw),
      ];
      lines.push(line.join(","));
    }
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sukari_fuel_theft_filtered.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function csvEscape(s) {
    var t = String(s == null ? "" : s);
    if (/[",\n\r]/.test(t)) {
      return '"' + t.replace(/"/g, '""') + '"';
    }
    return t;
  }

  function populateFilters() {
    var rows = payload.rows;
    var periods = $("filterPeriod");
    if (periods) {
      periods.innerHTML =
        '<option value="all">All periods</option>' +
        (payload.periods || [])
          .map(function (p) {
            return '<option value="' + escapeHtml(p.label) + '">' + escapeHtml(p.label) + "</option>";
          })
          .join("");
    }
    var cats = F.allCategoriesFromRows(rows);
    var catDiv = $("categoryChecks");
    if (catDiv) {
      catDiv.innerHTML = cats
        .map(function (c) {
          return (
            '<label class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-emerald-300 cursor-pointer">' +
            '<input type="checkbox" name="cat" value="' +
            escapeHtml(c) +
            '" checked class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500">' +
            escapeHtml(c) +
            "</label>"
          );
        })
        .join("");
      catDiv.querySelectorAll('input[name="cat"]').forEach(function (cb) {
        cb.addEventListener("change", applyFiltersAndRender);
      });
    }
    var regs = F.allRegistrationsFromRows(rows);
    var regSel = $("filterReg");
    var regList = $("regList");
    if (regList) {
      regList.innerHTML = regs
        .map(function (r) {
          return '<option value="' + escapeHtml(r) + '">';
        })
        .join("");
    }
    if (regSel) {
      regSel.innerHTML = '<option value="">All vehicles</option>' + regs.map(function (r) {
        return '<option value="' + escapeHtml(r) + '">' + escapeHtml(r) + "</option>";
      }).join("");
    }
  }

  function switchTab(n) {
    for (var i = 0; i < 5; i++) {
      var nav = $("nav" + i);
      var content = $("content" + i);
      if (nav) {
        nav.classList.toggle("nav-active", i === n);
      }
      if (content) {
        content.classList.toggle("hidden", i !== n);
      }
    }
    if (n === 4) {
      applyFiltersAndRender();
    }
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
    });
  }

  window.switchTab = switchTab;

  function init() {
    D.loadData()
      .then(function (data) {
        payload = data;
        if ($("dataSourceBadge")) {
          $("dataSourceBadge").textContent =
            data.meta && data.meta.source === "google_sheet" ? "Live: Google Sheet" : "Local: data.json";
        }
        populateFilters();
        ["filterPeriod", "filterStolen", "filterReg"].forEach(function (id) {
          var el = $(id);
          if (el) {
            el.addEventListener("change", applyFiltersAndRender);
          }
        });
        var ts = $("trendsSplit");
        if (ts) {
          ts.addEventListener("change", applyFiltersAndRender);
        }
        bindSortHeaders();
        var btn = $("btnExportCsv");
        if (btn) {
          btn.addEventListener("click", exportCsv);
        }
        var printBtn = $("btnPrint");
        if (printBtn) {
          printBtn.addEventListener("click", function () {
            window.print();
          });
        }
        applyFiltersAndRender();
      })
      .catch(function (e) {
        console.error(e);
        var main = $("mainContent");
        if (main) {
          main.innerHTML =
            '<div class="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-800">Could not load data. Serve this folder over HTTP (e.g. npx serve) so data/data.json can load, or open via a static server.</div>';
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
