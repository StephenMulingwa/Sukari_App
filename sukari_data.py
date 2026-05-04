"""
Shared dataset loading and normalization for Sukari dashboard and tools/build_data.py.
"""
from __future__ import annotations

import json
import re
import calendar
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
XLSX_DEFAULT = ROOT / "data.xlsx"
JSON_DEFAULT = ROOT / "data" / "data.json"

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# Kenya-style plates: 3–4 letter prefix (e.g. KTCB, KTCC) + 2–3 digits + 1 letter.
# Using only {3} wrongly matches "TCC" inside "KTCC" and drops the leading K.
_PLATE_PATTERNS = (
    re.compile(r"\b([A-Z]{3,4})\s+(\d{2,3})\s*([A-Z])\b", re.IGNORECASE),
    # KTCC_1.5KM/L 104G — junk between underscore and the real plate suffix
    re.compile(r"\b([A-Z]{3,4})_\S*\s+(\d{2,3})\s*([A-Z])\b", re.IGNORECASE),
    # KTCC_111G_1.5KM/L
    re.compile(r"\b([A-Z]{3,4})_(\d{2,3})\s*([A-Z])\b", re.IGNORECASE),
    re.compile(r"\b([A-Z]{3,4})[_\s]+(\d{2,3})\s*([A-Z])\b", re.IGNORECASE),
    # Strict 3-letter plates (e.g. KBV 715U) — after 3–4 patterns so KTCC → KTCC not TCC
    re.compile(r"\b([A-Z]{3})\s+(\d{2,3})\s*([A-Z])\b", re.IGNORECASE),
)


def _segment_to_iso(segment: str) -> str | None:
    if not segment or not isinstance(segment, str):
        return None
    s = segment.strip()
    m = re.match(
        r"^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)",
        s,
        re.IGNORECASE,
    )
    if not m:
        return None
    day = int(m.group(1))
    mon_s = m.group(2).lower()[:3]
    mon = MONTHS.get(mon_s)
    if not mon:
        return None
    year = 2025 if mon >= 10 else 2026
    last_d = calendar.monthrange(year, mon)[1]
    day = min(day, last_d)
    try:
        d = datetime(year, mon, day)
    except ValueError:
        d = datetime(year, mon, 1)
    return d.strftime("%Y-%m-%d")


def parse_period_start(label: str) -> str | None:
    if not label or not isinstance(label, str):
        return None
    return _segment_to_iso(label.strip())


def parse_period_end(label: str) -> str | None:
    if not label or not isinstance(label, str):
        return None
    s = label.strip()
    if " - " in s:
        second = s.split(" - ", 1)[1].strip()
        return _segment_to_iso(second)
    if "-" in s:
        parts = s.split("-", 1)
        if len(parts) > 1:
            second = parts[1].strip()
            return _segment_to_iso(second)
    return parse_period_start(s)


def parse_display_reg(raw: str) -> str:
    s = str(raw)
    for rx in _PLATE_PATTERNS:
        m = rx.search(s)
        if m:
            a, b, c = m.group(1).upper(), m.group(2), m.group(3).upper()
            return f"{a} {b}{c}"
    m2 = re.search(r"([A-Z]{3,4})[_\s]+(\d{2,3})[_\s]*([A-Z])", s, re.I)
    if m2:
        return f"{m2.group(1).upper()} {m2.group(2)}{m2.group(3).upper()}"
    return s[:40] if len(s) > 40 else s


def classify_vehicle_category(raw: str) -> str:
    t = str(raw).upper()
    t_compact = re.sub(r"[\s_]+", " ", t)
    if "HARVEST" in t and "BUS" in t:
        return "Harvesting Bus"
    if "HAULMASTER" in t or "HAUL MASTER" in t_compact:
        return "Haulmaster"
    if "TRACTOR" in t:
        return "Tractor"
    if "WINCH" in t:
        return "Winch"
    if "TIPPER" in t:
        return "Tipper"
    if "PRIME MOVER" in t or "PRIMEMOVER" in t_compact or "FAW" in t:
        return "Prime Mover"
    if "SALES" in t:
        return "Sales"
    if "HARVEST" in t:
        return "Harvesting Bus"
    return "Other"


def row_dict_from_raw(
    raw: str,
    stolen_type: str,
    fuel: float,
    duration: str,
) -> dict:
    ps = parse_period_start(duration)
    pe = parse_period_end(duration) or ps
    return {
        "registrationRaw": raw or "",
        "registration": parse_display_reg(raw or ""),
        "vehicleCategory": classify_vehicle_category(raw or ""),
        "stolenType": (stolen_type or "").strip(),
        "fuelLitres": float(fuel) if fuel is not None else 0.0,
        "duration": (duration or "").strip(),
        "periodStart": ps,
        "periodEnd": pe,
    }


def build_rows_from_dataframe(df: pd.DataFrame) -> list[dict]:
    col_map = {c: c.strip() for c in df.columns}
    df = df.rename(columns=col_map)
    reg_col = "Registration No"
    type_col = "Type"
    fuel_col = "Fuel Stolen (L)"
    dur_col = "Duration"
    rows = []
    for _, r in df.iterrows():
        raw = r[reg_col] if reg_col in df.columns else ""
        rows.append(
            row_dict_from_raw(
                str(raw) if pd.notna(raw) else "",
                str(r[type_col]).strip() if pd.notna(r.get(type_col)) else "",
                float(r[fuel_col]) if pd.notna(r.get(fuel_col)) else 0.0,
                str(r[dur_col]).strip() if pd.notna(r.get(dur_col)) else "",
            )
        )
    return rows


def build_periods(rows: list[dict]) -> list[dict]:
    labels = sorted(
        {row["duration"] for row in rows if row.get("duration")},
        key=lambda x: (parse_period_start(x) or "9999", x),
    )
    return [{"label": lab, "sortKey": parse_period_start(lab) or lab} for lab in labels]


def build_meta(rows: list[dict], source: str) -> dict:
    regs = {r["registration"] for r in rows if r.get("registration")}
    cats = {r["vehicleCategory"] for r in rows if r.get("vehicleCategory")}
    return {
        "source": source,
        "sheet": "ALL",
        "rowCount": len(rows),
        "uniqueRegistrations": len(regs),
        "categoriesCount": len(cats),
        "categories": sorted(cats),
        "generated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def build_payload_from_xlsx(path: Path | None = None) -> dict:
    path = path or XLSX_DEFAULT
    if not path.is_file():
        raise FileNotFoundError(path)
    df = pd.read_excel(path, sheet_name="ALL")
    rows = build_rows_from_dataframe(df)
    meta = build_meta(rows, str(path.name))
    return {"meta": meta, "periods": build_periods(rows), "rows": rows}


def enrich_json_rows(rows: list[dict]) -> list[dict]:
    """Add periodStart/periodEnd if missing (e.g. old JSON)."""
    out = []
    for row in rows:
        d = row.get("duration", "")
        if row.get("periodStart") and row.get("periodEnd"):
            out.append(dict(row))
            continue
        ps = parse_period_start(d)
        pe = parse_period_end(d) or ps
        x = dict(row)
        x["periodStart"] = ps
        x["periodEnd"] = pe
        out.append(x)
    return out


def load_dataset(xlsx_path: Path | None = None, json_path: Path | None = None) -> dict:
    """
    Prefer data.xlsx; fall back to data/data.json.
    """
    xlsx_path = xlsx_path or XLSX_DEFAULT
    json_path = json_path or JSON_DEFAULT
    if xlsx_path.is_file():
        payload = build_payload_from_xlsx(xlsx_path)
    elif json_path.is_file():
        raw = json.loads(json_path.read_text(encoding="utf-8"))
        rows = enrich_json_rows(raw.get("rows", []))
        meta = build_meta(rows, str(json_path.name))
        payload = {
            "meta": meta,
            "periods": raw.get("periods") or build_periods(rows),
            "rows": rows,
        }
        payload["meta"]["source"] = json_path.name
    else:
        raise FileNotFoundError(f"Neither {xlsx_path} nor {json_path} found")

    # Audit consistency
    m = payload["meta"]
    assert m["rowCount"] == len(payload["rows"])
    assert m["uniqueRegistrations"] == len({r["registration"] for r in payload["rows"]})
    return payload
