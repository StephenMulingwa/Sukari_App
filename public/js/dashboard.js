(function () {
  "use strict";

  var PAGE_SIZE = 15;
  var brand = {
    green: "#16a34a",
    greenLight: "rgba(22, 163, 74, 0.12)",
    amber: "#d97706",
    slate: "#64748b",
  };

  var payload = window.__SUKARI_BOOTSTRAP__;
  if (!payload || !payload.rows) {
    console.error("Missing bootstrap data");
    return;
  }

  var allRows = payload.rows;
  var periods = payload.periods || [];
  var meta = payload.meta || {};
  var catRegMap = buildCatRegMap(allRows);
  var allRegs = sortedRegs(allRows);

  var vehSort = { key: "fuelLitres", dir: -1 };
  var vehPage = 1;

  function buildCatRegMap(rows) {
    var m = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var c = r.vehicleCategory;
      if (!m[c]) {
        m[c] = {};
      }
      m[c][r.registration] = true;
    }
    var out = {};
    for (var k in m) {
      out[k] = Object.keys(m[k]).sort();
    }
    return out;
  }

  function sortedRegs(rows) {
    var s = {};
    for (var i = 0; i < rows.length; i++) {
      s[rows[i].registration] = true;
    }
    return Object.keys(s).sort();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function val(id) {
    var el = $(id);
    return el ? el.value : "";
  }

  function formatNum(n, d) {
    d = d === undefined ? 1 : d;
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function passesDate(row, dateFrom, dateTo) {
    if (!row.periodStart || !row.periodEnd) {
      return true;
    }
    var r0 = new Date(row.periodStart + "T00:00:00");
    var r1 = new Date(row.periodEnd + "T23:59:59");
    if (dateFrom) {
      var f = new Date(dateFrom + "T00:00:00");
      if (r1 < f) {
        return false;
      }
    }
    if (dateTo) {
      var t = new Date(dateTo + "T23:59:59");
      if (r0 > t) {
        return false;
      }
    }
    return true;
  }

  function filterRows(rows, s, usePeriodQuick) {
    return rows.filter(function (r) {
      if (!passesDate(r, s.dateFrom, s.dateTo)) {
        return false;
      }
      if (s.category && s.category !== "all" && r.vehicleCategory !== s.category) {
        return false;
      }
      if (s.registration && r.registration !== s.registration) {
        return false;
      }
      if (s.stolenType && s.stolenType !== "all" && r.stolenType !== s.stolenType) {
        return false;
      }
      if (usePeriodQuick && s.periodQuick && s.periodQuick !== "all" && r.duration !== s.periodQuick) {
        return false;
      }
      return true;
    });
  }

  function getState(prefix, withQuick) {
    var o = {
      dateFrom: val(prefix + "_dateFrom"),
      dateTo: val(prefix + "_dateTo"),
      category: val(prefix + "_category"),
      registration: val(prefix + "_registration"),
      stolenType: val(prefix + "_stolen"),
    };
    if (withQuick) {
      o.periodQuick = val(prefix + "_periodQuick");
    } else {
      o.periodQuick = "all";
    }
    return o;
  }

  function fillCategorySelect(el) {
    if (!el) {
      return;
    }
    var cats = meta.categories || [];
    var opts = ['<option value="all">All categories</option>'];
    for (var i = 0; i < cats.length; i++) {
      opts.push('<option value="' + escapeHtml(cats[i]) + '">' + escapeHtml(cats[i]) + "</option>");
    }
    el.innerHTML = opts.join("");
  }

  function fillRegSelect(selectEl, category) {
    if (!selectEl) {
      return;
    }
    var list =
      !category || category === "all"
        ? allRegs
        : catRegMap[category] || [];
    var opts = ['<option value="">All vehicles</option>'];
    for (var i = 0; i < list.length; i++) {
      opts.push('<option value="' + escapeHtml(list[i]) + '">' + escapeHtml(list[i]) + "</option>");
    }
    selectEl.innerHTML = opts.join("");
  }

  function wireCategoryReg(prefix, withQuick) {
    var cat = $(prefix + "_category");
    var reg = $(prefix + "_registration");
    if (!cat || !reg) {
      return;
    }
    cat.addEventListener("change", function () {
      var v = cat.value;
      var prev = reg.value;
      fillRegSelect(reg, v);
      if (listContains(reg, prev)) {
        reg.value = prev;
      }
      if (prefix === "veh") {
        vehPage = 1;
      }
      debounceRender(prefix);
    });
  }

  function listContains(sel, v) {
    if (!v) {
      return true;
    }
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === v) {
        return true;
      }
    }
    return false;
  }

  var debouncers = {};
  function debounceRender(prefix) {
    clearTimeout(debouncers[prefix]);
    debouncers[prefix] = setTimeout(function () {
      renderForPrefix(prefix);
    }, 0);
  }

  function renderForPrefix(prefix) {
    if (prefix === "ov") {
      renderOverview();
    }
    if (prefix === "veh") {
      renderVehicles();
    }
    if (prefix === "inv") {
      renderInvestigation();
    }
    if (prefix === "tr") {
      renderTrends();
    }
    if (prefix === "rep") {
      renderReports();
    }
  }

  function ensureChart(canvas, type, data, options) {
    if (!canvas) {
      return;
    }
    if (canvas._chart) {
      canvas._chart.destroy();
      canvas._chart = null;
    }
    canvas._chart = new Chart(canvas, { type: type, data: data, options: options || {} });
  }

  function sortedPeriodLabels(rows) {
    var labels = periods.map(function (p) {
      return p.label;
    });
    var present = {};
    for (var i = 0; i < rows.length; i++) {
      present[rows[i].duration] = true;
    }
    return labels.filter(function (l) {
      return present[l];
    });
  }

  function litresByPeriod(rows, periodLabels) {
    var map = {};
    for (var i = 0; i < periodLabels.length; i++) {
      map[periodLabels[i]] = 0;
    }
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      if (map[r.duration] != null) {
        map[r.duration] += r.fuelLitres;
      }
    }
    return periodLabels.map(function (l) {
      return map[l] || 0;
    });
  }

  function aggregateByCategory(rows) {
    var m = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var k = r.vehicleCategory;
      if (!m[k]) {
        m[k] = { category: k, incidents: 0, fuelLitres: 0 };
      }
      m[k].incidents += 1;
      m[k].fuelLitres += r.fuelLitres;
    }
    return Object.values(m).sort(function (a, b) {
      return b.fuelLitres - a.fuelLitres;
    });
  }

  function aggregateByReg(rows) {
    var m = {};
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      total += r.fuelLitres;
      var k = r.registration;
      if (!m[k]) {
        m[k] = {
          registration: k,
          vehicleCategory: r.vehicleCategory,
          incidents: 0,
          fuelLitres: 0,
        };
      }
      m[k].incidents += 1;
      m[k].fuelLitres += r.fuelLitres;
    }
    var list = Object.values(m);
    for (var j = 0; j < list.length; j++) {
      list[j].pct = total > 0 ? (list[j].fuelLitres / total) * 100 : 0;
    }
    return list;
  }

  function totalLitres(rows) {
    var t = 0;
    for (var i = 0; i < rows.length; i++) {
      t += rows[i].fuelLitres;
    }
    return t;
  }

  function crossTabLitres(rows) {
    var stSet = {};
    var catSet = {};
    for (var i = 0; i < rows.length; i++) {
      stSet[rows[i].stolenType] = true;
      catSet[rows[i].vehicleCategory] = true;
    }
    var stList = Object.keys(stSet).sort();
    var catList = Object.keys(catSet).sort();
    var grid = {};
    for (var si = 0; si < stList.length; si++) {
      grid[stList[si]] = {};
      for (var ci = 0; ci < catList.length; ci++) {
        grid[stList[si]][catList[ci]] = 0;
      }
    }
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var st = r.stolenType;
      var cat = r.vehicleCategory;
      if (!grid[st]) {
        grid[st] = {};
      }
      if (grid[st][cat] == null) {
        grid[st][cat] = 0;
      }
      grid[st][cat] += r.fuelLitres;
    }
    return { grid: grid, stolenTypes: stList, categories: catList };
  }

  function renderOverview() {
    var s = getState("ov", false);
    var rows = filterRows(allRows, s, false);
    var total = totalLitres(rows);
    var incidents = rows.length;
    var regs = {};
    for (var i = 0; i < rows.length; i++) {
      regs[rows[i].registration] = true;
    }
    var distinctVeh = Object.keys(regs).length;

    $("auditRows").textContent = String(meta.rowCount || allRows.length);
    $("auditVehicles").textContent = String(meta.uniqueRegistrations || allRegs.length);
    $("auditCats").textContent = String((meta.categories || []).length);

    $("ov_kpiLitres").textContent = formatNum(total, 1) + " L";
    $("ov_kpiIncidents").textContent = String(incidents);
    $("ov_kpiDistinctVeh").textContent = String(distinctVeh);

    var byCat = aggregateByCategory(rows);
    var top = byCat[0];
    $("ov_kpiMostCat").textContent = top ? top.category : "—";
    $("ov_kpiMostCatSub").textContent = top
      ? formatNum(top.fuelLitres, 1) + " L · " + top.incidents + " inc."
      : "";

    var direct = 0;
    var ret = 0;
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].stolenType === "Direct Theft") {
        direct += rows[j].fuelLitres;
      }
      if (rows[j].stolenType === "Return pipe") {
        ret += rows[j].fuelLitres;
      }
    }
    var typed = direct + ret;
    $("ov_kpiDirect").textContent = typed > 0 ? formatNum((direct / typed) * 100, 0) + "%" : "—";

    var plabels = sortedPeriodLabels(rows);
    var trendData = litresByPeriod(rows, plabels);

    ensureChart(
      $("ov_chartTrend"),
      "line",
      {
        labels: plabels,
        datasets: [
          {
            label: "Litres",
            data: trendData,
            borderColor: brand.green,
            backgroundColor: brand.greenLight,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
          },
        ],
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 45 } },
          y: { beginAtZero: true },
        },
      }
    );

    var pieLabels = [];
    var pieData = [];
    var pieColors = [brand.green, brand.amber];
    if (direct > 0) {
      pieLabels.push("Direct Theft");
      pieData.push(direct);
    }
    if (ret > 0) {
      pieLabels.push("Return pipe");
      pieData.push(ret);
    }
    if (!pieData.length) {
      pieLabels = ["No data"];
      pieData = [1];
      pieColors = [brand.slate];
    }

    ensureChart(
      $("ov_chartPie"),
      "doughnut",
      {
        labels: pieLabels,
        datasets: [{ data: pieData, backgroundColor: pieColors.slice(0, pieData.length), borderWidth: 0 }],
      },
      { responsive: true, maintainAspectRatio: false, cutout: "70%" }
    );

    var top5 = byCat.slice(0, 5);
    ensureChart(
      $("ov_chartTop"),
      "bar",
      {
        labels: top5.map(function (x) {
          return x.category;
        }),
        datasets: [
          {
            label: "L",
            data: top5.map(function (x) {
              return x.fuelLitres;
            }),
            backgroundColor: brand.green,
            borderRadius: 6,
          },
        ],
      },
      {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      }
    );
  }

  function compareVeh(a, b) {
    var k = vehSort.key;
    var mul = vehSort.dir;
    var va = a[k];
    var vb = b[k];
    if (typeof va === "string") {
      return va.localeCompare(vb) * mul;
    }
    return va > vb ? mul : va < vb ? -mul : 0;
  }

  function renderVehicles() {
    var s = getState("veh", false);
    var rows = filterRows(allRows, s, false);
    var agg = aggregateByReg(rows);
    agg.sort(compareVeh);
    var n = agg.length;
    $("veh_countLabel").textContent = n + " vehicles in filtered results";

    var pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
    if (vehPage > pages) {
      vehPage = pages;
    }
    var start = (vehPage - 1) * PAGE_SIZE;
    var slice = agg.slice(start, start + PAGE_SIZE);

    var tbody = $("veh_tableBody");
    var total = totalLitres(rows);
    tbody.innerHTML = slice
      .map(function (r) {
        return (
          '<tr class="hover:bg-emerald-50/40"><td class="py-4 font-medium">' +
          escapeHtml(r.registration) +
          '</td><td class="py-4 text-slate-600">' +
          escapeHtml(r.vehicleCategory) +
          '</td><td class="py-4 text-center">' +
          r.incidents +
          '</td><td class="py-4 text-right font-semibold text-emerald-800">' +
          formatNum(r.fuelLitres, 2) +
          '</td><td class="py-4 text-right text-slate-500">' +
          formatNum(r.pct, 1) +
          "%</td></tr>"
        );
      })
      .join("");
    if (!slice.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="py-10 text-center text-slate-500">No rows match.</td></tr>';
    }

    var end = Math.min(start + slice.length, n);
    $("veh_pageInfo").textContent =
      n === 0 ? "Showing 0 of 0" : "Showing " + (start + 1) + "–" + end + " of " + n;
    $("veh_prev").disabled = vehPage <= 1;
    $("veh_next").disabled = vehPage >= pages;
  }

  function buildInsights(rows) {
    var lines = [];
    if (!rows.length) {
      return ["No incidents match these filters."];
    }
    var total = totalLitres(rows);
    var byCat = aggregateByCategory(rows);
    var top = byCat[0];
    if (top) {
      lines.push(
        "Highest fuel loss: **" +
          top.category +
          "** (~" +
          formatNum((top.fuelLitres / total) * 100, 0) +
          "% of litres)."
      );
    }
    var tab = crossTabLitres(rows);
    var bestMix = null;
    var bestRatio = -1;
    for (var ci = 0; ci < tab.categories.length; ci++) {
      var cat = tab.categories[ci];
      var d = 0;
      var rpipe = 0;
      for (var ti = 0; ti < tab.stolenTypes.length; ti++) {
        var st = tab.stolenTypes[ti];
        var v = (tab.grid[st] && tab.grid[st][cat]) || 0;
        if (st === "Direct Theft") {
          d += v;
        }
        if (st === "Return pipe") {
          rpipe += v;
        }
      }
      if (d + rpipe > 1) {
        var ratio = rpipe / (d + rpipe);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestMix = cat;
        }
      }
    }
    if (bestMix && bestRatio > 0.35) {
      lines.push(
        "**" + bestMix + "** has a higher share of **Return pipe** losses in this slice."
      );
    }
    return lines;
  }

  function renderMarkdownLite(t) {
    return t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function renderInvestigation() {
    var s = getState("inv", true);
    var rows = filterRows(allRows, s, true);

    var tab = crossTabLitres(rows);
    var types = tab.stolenTypes;
    var cats = tab.categories;
    var grid = tab.grid;
    if (!types.length || !cats.length) {
      ensureChart(
        $("inv_chartStack"),
        "bar",
        { labels: ["—"], datasets: [{ label: "L", data: [0], backgroundColor: brand.slate }] },
        { responsive: true, maintainAspectRatio: false }
      );
    } else {
      var colors = ["rgba(22, 163, 74, 0.85)", "rgba(217, 119, 6, 0.85)", "rgba(100, 116, 139, 0.85)", "rgba(37, 99, 235, 0.85)"];
      var datasets = types.map(function (st, idx) {
        return {
          label: st,
          data: cats.map(function (c) {
            return (grid[st] && grid[st][c]) || 0;
          }),
          backgroundColor: colors[idx % colors.length],
          borderRadius: 4,
        };
      });
      ensureChart(
        $("inv_chartStack"),
        "bar",
        { labels: cats, datasets: datasets },
        {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          plugins: { legend: { position: "bottom" }, tooltip: { mode: "index", intersect: false } },
        }
      );
    }

    var ul = $("inv_insights");
    var insightLines = buildInsights(rows);
    ul.innerHTML = insightLines
      .map(function (line) {
        return '<li class="leading-relaxed">' + renderMarkdownLite(line) + "</li>";
      })
      .join("");

    var byP = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!byP[r.duration]) {
        byP[r.duration] = { litres: 0, inc: 0 };
      }
      byP[r.duration].litres += r.fuelLitres;
      byP[r.duration].inc += 1;
    }
    var periodOrder = {};
    for (var pi = 0; pi < periods.length; pi++) {
      periodOrder[periods[pi].label] = pi;
    }
    var keys = Object.keys(byP).sort(function (a, b) {
      var oa = periodOrder[a] != null ? periodOrder[a] : 999;
      var ob = periodOrder[b] != null ? periodOrder[b] : 999;
      return oa - ob;
    });
    $("inv_periodBody").innerHTML = keys
      .map(function (k) {
        var x = byP[k];
        return (
          "<tr class=\"border-b border-slate-100\"><td class=\"py-2 pr-2\">" +
          escapeHtml(k) +
          '</td><td class="py-2 text-right">' +
          x.inc +
          '</td><td class="py-2 text-right font-medium">' +
          formatNum(x.litres, 1) +
          "</td></tr>"
        );
      })
      .join("");
  }

  function renderTrends() {
    var s = getState("tr", true);
    var rows = filterRows(allRows, s, true);
    var split = val("tr_split") || "total";
    var plabels = sortedPeriodLabels(rows);

    function sumFor(pred) {
      var map = {};
      for (var i = 0; i < plabels.length; i++) {
        map[plabels[i]] = 0;
      }
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        if (pred(r) && map[r.duration] != null) {
          map[r.duration] += r.fuelLitres;
        }
      }
      return plabels.map(function (l) {
        return map[l] || 0;
      });
    }

    if (split === "stolen") {
      ensureChart(
        $("tr_chartSplit"),
        "line",
        {
          labels: plabels,
          datasets: [
            {
              label: "Direct Theft",
              data: sumFor(function (r) {
                return r.stolenType === "Direct Theft";
              }),
              borderColor: brand.green,
              backgroundColor: "rgba(22, 163, 74, 0.08)",
              fill: true,
              tension: 0.35,
              borderWidth: 2,
            },
            {
              label: "Return pipe",
              data: sumFor(function (r) {
                return r.stolenType === "Return pipe";
              }),
              borderColor: brand.amber,
              backgroundColor: "rgba(217, 119, 6, 0.08)",
              fill: true,
              tension: 0.35,
              borderWidth: 2,
            },
          ],
        },
        {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: { x: { ticks: { maxRotation: 45 } }, y: { beginAtZero: true } },
        }
      );
    } else {
      var totals = litresByPeriod(rows, plabels);
      ensureChart(
        $("tr_chartSplit"),
        "line",
        {
          labels: plabels,
          datasets: [
            {
              label: "Total litres",
              data: totals,
              borderColor: brand.green,
              backgroundColor: brand.greenLight,
              fill: true,
              tension: 0.35,
              borderWidth: 2,
            },
          ],
        },
        {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true } },
          scales: { x: { ticks: { maxRotation: 45 } }, y: { beginAtZero: true } },
        }
      );
    }
  }

  function renderReports() {
    var s = getState("rep", false);
    var rows = filterRows(allRows, s, false);
    $("rep_rowCount").textContent = String(rows.length);
  }

  function exportCsv() {
    var s = getState("rep", false);
    var rows = filterRows(allRows, s, false);
    var header = ["Registration", "Vehicle category", "Stolen type", "Fuel stolen (L)", "Period", "Period start", "Period end", "Registration raw"];
    var lines = [header.join(",")];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      lines.push(
        [
          csvEscape(r.registration),
          csvEscape(r.vehicleCategory),
          csvEscape(r.stolenType),
          r.fuelLitres,
          csvEscape(r.duration),
          csvEscape(r.periodStart || ""),
          csvEscape(r.periodEnd || ""),
          csvEscape(r.registrationRaw),
        ].join(",")
      );
    }
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sukari_export.csv";
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

  function wireInputs(prefix, withQuick) {
    function bind(id) {
      var el = $(id);
      if (!el) {
        return;
      }
      function onChange() {
        if (prefix === "veh") {
          vehPage = 1;
        }
        debounceRender(prefix);
      }
      el.addEventListener("change", onChange);
      el.addEventListener("input", onChange);
    }
    bind(prefix + "_dateFrom");
    bind(prefix + "_dateTo");
    bind(prefix + "_registration");
    bind(prefix + "_stolen");
    if (withQuick) {
      bind(prefix + "_periodQuick");
    }
    if (prefix === "tr") {
      var sp = $("tr_split");
      if (sp) {
        sp.addEventListener("change", function () {
          renderTrends();
        });
      }
    }
  }

  function switchTab(n) {
    for (var i = 0; i < 5; i++) {
      var nav = $("nav" + i);
      var panel = $("content" + i);
      if (nav) {
        nav.classList.toggle("nav-active", i === n);
        nav.classList.toggle("text-emerald-100/90", i !== n);
        nav.classList.toggle("font-semibold", i === n);
      }
      if (panel) {
        panel.classList.toggle("hidden", i !== n);
      }
    }
    requestAnimationFrame(function () {
      ["ov_chartTrend", "ov_chartPie", "ov_chartTop", "inv_chartStack", "tr_chartSplit"].forEach(function (id) {
        var c = $(id);
        if (c && c._chart) {
          c._chart.resize();
        }
      });
    });
  }

  function initSortButtons() {
    document.querySelectorAll(".sort-btn[data-tab='veh']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var col = btn.getAttribute("data-col");
        if (vehSort.key === col) {
          vehSort.dir = -vehSort.dir;
        } else {
          vehSort.key = col;
          vehSort.dir = col === "registration" || col === "vehicleCategory" ? 1 : -1;
        }
        renderVehicles();
      });
    });
  }

  function init() {
    fillCategorySelect($("ov_category"));
    fillCategorySelect($("veh_category"));
    fillCategorySelect($("inv_category"));
    fillCategorySelect($("tr_category"));
    fillCategorySelect($("rep_category"));

    fillRegSelect($("ov_registration"), "all");
    fillRegSelect($("veh_registration"), "all");
    fillRegSelect($("inv_registration"), "all");
    fillRegSelect($("tr_registration"), "all");
    fillRegSelect($("rep_registration"), "all");

    wireCategoryReg("ov", false);
    wireCategoryReg("veh", false);
    wireCategoryReg("inv", true);
    wireCategoryReg("tr", true);
    wireCategoryReg("rep", false);

    wireInputs("ov", false);
    wireInputs("veh", false);
    wireInputs("inv", true);
    wireInputs("tr", true);
    wireInputs("rep", false);

    $("veh_prev").addEventListener("click", function () {
      if (vehPage > 1) {
        vehPage--;
        renderVehicles();
      }
    });
    $("veh_next").addEventListener("click", function () {
      vehPage++;
      renderVehicles();
    });

    $("rep_export").addEventListener("click", exportCsv);
    $("rep_print").addEventListener("click", function () {
      window.print();
    });

    initSortButtons();

    renderOverview();
    renderVehicles();
    renderInvestigation();
    renderTrends();
    renderReports();

    window.SukariUI = { switchTab: switchTab };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
