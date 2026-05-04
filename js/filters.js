/**
 * Filter state and row pipeline.
 */
(function (global) {
  function createState() {
    return {
      period: "all",
      /** null = all categories; else Set of category name */
      categories: null,
      registration: "",
      stolenType: "all",
    };
  }

  function allCategoriesFromRows(rows) {
    var s = {};
    for (var i = 0; i < rows.length; i++) {
      s[rows[i].vehicleCategory] = true;
    }
    return Object.keys(s).sort();
  }

  function allRegistrationsFromRows(rows) {
    var s = {};
    for (var i = 0; i < rows.length; i++) {
      s[rows[i].registration] = true;
    }
    return Object.keys(s).sort();
  }

  function filterRows(rows, st) {
    return rows.filter(function (r) {
      if (st.period !== "all" && r.duration !== st.period) {
        return false;
      }
      if (st.categories && !st.categories.has(r.vehicleCategory)) {
        return false;
      }
      if (st.registration && r.registration !== st.registration) {
        return false;
      }
      if (st.stolenType !== "all" && r.stolenType !== st.stolenType) {
        return false;
      }
      return true;
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

  /** Cross-tab stolenType x vehicleCategory -> litres; stolenTypes/categories derived if omitted */
  function crossTabLitres(rows, stolenTypes, categories) {
    var stList = stolenTypes;
    var catList = categories;
    if (!stList || !catList) {
      var stSet = {};
      var catSet = {};
      for (var i = 0; i < rows.length; i++) {
        stSet[rows[i].stolenType] = true;
        catSet[rows[i].vehicleCategory] = true;
      }
      stList = Object.keys(stSet).sort();
      catList = Object.keys(catSet).sort();
    }
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

  function totalLitres(rows) {
    var t = 0;
    for (var i = 0; i < rows.length; i++) {
      t += rows[i].fuelLitres;
    }
    return t;
  }

  global.SukariFilters = {
    createState: createState,
    allCategoriesFromRows: allCategoriesFromRows,
    allRegistrationsFromRows: allRegistrationsFromRows,
    filterRows: filterRows,
    aggregateByReg: aggregateByReg,
    aggregateByCategory: aggregateByCategory,
    crossTabLitres: crossTabLitres,
    totalLitres: totalLitres,
  };
})(typeof window !== "undefined" ? window : globalThis);
