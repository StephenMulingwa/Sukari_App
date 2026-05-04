"""
Build data/data.json from data.xlsx. Run from project root:
  python tools/build_data.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sukari_data import build_payload_from_xlsx  # noqa: E402

OUT = ROOT / "data" / "data.json"
XLSX = ROOT / "data.xlsx"


def main() -> None:
    if not XLSX.is_file():
        raise SystemExit(f"Missing {XLSX}")
    payload = build_payload_from_xlsx(XLSX)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=0), encoding="utf-8")
    m = payload["meta"]
    print(
        f"Wrote {OUT} ({m['rowCount']} rows, {len(payload['periods'])} periods, "
        f"{m['uniqueRegistrations']} vehicles)"
    )


if __name__ == "__main__":
    main()
