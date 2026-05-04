/**
 * Chart.js instances for dashboard.
 */
(function (global) {
  var brand = {
    green: "#16a34a",
    greenLight: "rgba(22, 163, 74, 0.12)",
    amber: "#d97706",
    slate: "#64748b",
  };

  function ensureChart(ctx, type, data, options) {
    if (ctx._chart) {
      ctx._chart.destroy();
      ctx._chart = null;
    }
    var c = new Chart(ctx, { type: type, data: data, options: options || {} });
    ctx._chart = c;
    return c;
  }

  function sortedPeriodLabels(periodDefs, rowsForPresence) {
    var labels = periodDefs.map(function (p) {
      return p.label;
    });
    var present = {};
    for (var i = 0; i < rowsForPresence.length; i++) {
      present[rowsForPresence[i].duration] = true;
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

  function updateOverview(periodDefs, filteredRows, fullRowsForTrendOptional) {
    var trendRows = fullRowsForTrendOptional || filteredRows;
    var ctxTrend = document.getElementById("chartTrend");
    var ctxPie = document.getElementById("chartPie");
    var ctxTop = document.getElementById("chartTopTypes");
    if (!ctxTrend || !ctxPie || !ctxTop) {
      return;
    }

    var periodLabels = sortedPeriodLabels(periodDefs, trendRows);
    var trendData = litresByPeriod(trendRows, periodLabels);

    var direct = 0;
    var ret = 0;
    for (var i = 0; i < filteredRows.length; i++) {
      var s = filteredRows[i].stolenType;
      if (s === "Direct Theft") {
        direct += filteredRows[i].fuelLitres;
      } else if (s === "Return pipe") {
        ret += filteredRows[i].fuelLitres;
      }
    }
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

    var F = global.SukariFilters;
    var byCat = F.aggregateByCategory(filteredRows);
    var top3 = byCat.slice(0, 5);
    var topLabels = top3.map(function (x) {
      return x.category;
    });
    var topValues = top3.map(function (x) {
      return x.fuelLitres;
    });

    ensureChart(
      ctxTrend,
      "line",
      {
        labels: periodLabels,
        datasets: [
          {
            label: "Litres stolen",
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
          x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true },
        },
      }
    );

    ensureChart(
      ctxPie,
      "doughnut",
      {
        labels: pieLabels,
        datasets: [
          {
            data: pieData,
            backgroundColor: pieColors.slice(0, pieData.length),
            borderWidth: 0,
          },
        ],
      },
      { responsive: true, maintainAspectRatio: false, cutout: "70%" }
    );

    ensureChart(
      ctxTop,
      "bar",
      {
        labels: topLabels,
        datasets: [
          {
            label: "L",
            data: topValues,
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

  function updateInvestigation(periodDefs, filteredRows) {
    var ctx = document.getElementById("chartStack");
    if (!ctx) {
      return;
    }
    var F = global.SukariFilters;
    var tab = F.crossTabLitres(filteredRows);
    var types = tab.stolenTypes;
    var cats = tab.categories;
    var grid = tab.grid;
    if (!types.length || !cats.length) {
      ensureChart(
        ctx,
        "bar",
        { labels: ["No data"], datasets: [{ label: "L", data: [0], backgroundColor: brand.slate }] },
        { responsive: true, maintainAspectRatio: false }
      );
      return;
    }
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
      ctx,
      "bar",
      {
        labels: cats,
        datasets: datasets,
      },
      {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: { mode: "index", intersect: false },
        },
      }
    );
  }

  function updateTrends(periodDefs, filteredRows, splitMode) {
    var ctx = document.getElementById("chartTrendSplit");
    if (!ctx) {
      return;
    }
    var periodLabels = sortedPeriodLabels(periodDefs, filteredRows);
    if (!splitMode || splitMode === "total") {
      var totals = litresByPeriod(filteredRows, periodLabels);
      ensureChart(
        ctx,
        "line",
        {
          labels: periodLabels,
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
          scales: {
            x: { ticks: { maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero: true },
          },
        }
      );
      return;
    }
    if (splitMode === "stolen") {
      function sumFor(rows, pred) {
        var map = {};
        for (var i = 0; i < periodLabels.length; i++) {
          map[periodLabels[i]] = 0;
        }
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j];
          if (pred(r) && map[r.duration] != null) {
            map[r.duration] += r.fuelLitres;
          }
        }
        return periodLabels.map(function (l) {
          return map[l] || 0;
        });
      }
      ensureChart(
        ctx,
        "line",
        {
          labels: periodLabels,
          datasets: [
            {
              label: "Direct Theft",
              data: sumFor(filteredRows, function (r) {
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
              data: sumFor(filteredRows, function (r) {
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
          scales: {
            x: { ticks: { maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero: true },
          },
        }
      );
    }
  }

  global.SukariCharts = {
    updateOverview: updateOverview,
    updateInvestigation: updateInvestigation,
    updateTrends: updateTrends,
    sortedPeriodLabels: sortedPeriodLabels,
  };
})(typeof window !== "undefined" ? window : globalThis);
