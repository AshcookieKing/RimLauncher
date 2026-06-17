#!/usr/bin/env python3
"""POST spawn_convoy и spawn_patrol в map_api (очередь arma_map_admin_actions)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_MAP_API = Path(__file__).resolve().parents[1]
if str(_MAP_API) not in sys.path:
    sys.path.insert(0, str(_MAP_API))

import config  # noqa: E402


def _post(act: str, *, base: str, key: str) -> tuple[int, dict]:
    # Сухопутные координаты Kapaulio (8100/11800 давали море — колонна «ползла» water_adj).
    body = {
        "action": act,
        "pos_x": 15200.0,
        "pos_y": 5.0,
        "pos_z": 16800.0,
        "route_points": [
            {"pos_x": 15200.0, "pos_y": 5.0, "pos_z": 16800.0},
            {"pos_x": 15500.0, "pos_y": 5.0, "pos_z": 17100.0},
            {"pos_x": 15800.0, "pos_y": 5.0, "pos_z": 16950.0},
        ],
        "veh_count": 2,
        "vehicle_class": "3AS_AAT_tan",
        "npc_class": "JLTS_Droid_B1_E5",
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{base.rstrip('/')}/api/map/admin/action",
        data=data,
        headers={"Content-Type": "application/json", "X-Map-Admin-Key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            j = json.loads(raw)
        except json.JSONDecodeError:
            j = {"body": raw}
        return e.code, j


def main() -> None:
    key = (config.MAP_API_ADMIN_SECRET or "").strip()
    if not key:
        print("MAP_API_ADMIN_SECRET пуст — задайте в map_api/local.env", file=sys.stderr)
        sys.exit(2)
    port = int(os.environ.get("MAP_API_PORT", "5050"))
    base = os.environ.get("MAP_API_BASE_URL", f"http://127.0.0.1:{port}")
    for act in ("spawn_convoy", "spawn_patrol"):
        code, j = _post(act, base=base, key=key)
        print(f"{act}: HTTP {code} {json.dumps(j, ensure_ascii=False)}")
        if code != 201:
            sys.exit(1)


if __name__ == "__main__":
    main()
