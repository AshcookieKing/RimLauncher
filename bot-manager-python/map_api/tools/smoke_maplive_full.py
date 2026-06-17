#!/usr/bin/env python3
"""Smoke: zone spawn queue + patrol + route_append (needs map_api + Arma mapLive)."""
from __future__ import annotations

import json
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import config  # noqa: E402


def _req(
    base: str, method: str, path: str, body: dict | None, headers: dict
) -> tuple[int, dict]:
    url = base.rstrip("/") + path
    data = None if body is None else json.dumps(body).encode("utf-8")
    h = dict(headers)
    if data is not None:
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:800]}


def main() -> int:
    base = "http://127.0.0.1:5050"
    adm = (config.MAP_API_ADMIN_SECRET or "").strip()
    if not adm:
        print("MAP_API_ADMIN_SECRET empty", file=sys.stderr)
        return 2
    h = {"X-Map-Admin-Key": adm}

    c1, zj = _req(
        base,
        "POST",
        "/api/map/zones/spawn-request?server_id=1",
        {
            "zone_uid": f"smoke_{secrets.token_hex(10)}",
            "template_zone_id": "kpp_cis_checkpoint",
            "pos_x": 15150.0,
            "pos_y": 5.0,
            "pos_z": 16750.0,
            "trigger_radius_a": 80,
            "trigger_radius_b": 80,
        },
        h,
    )
    print("zone_spawn", c1, zj)
    if c1 != 201:
        return 1

    body1 = {
        "action": "spawn_patrol",
        "pos_x": 15080.0,
        "pos_y": 5.0,
        "pos_z": 16680.0,
        "route_points": [
            {"pos_x": 15080.0, "pos_y": 5.0, "pos_z": 16680.0},
            {"pos_x": 15120.0, "pos_y": 5.0, "pos_z": 16720.0},
        ],
        "veh_count": 2,
        "vehicle_class": "3AS_AAT_tan",
        "npc_class": "JLTS_Droid_B1_E5",
    }
    c2, j1 = _req(base, "POST", "/api/map/admin/action", body1, h)
    print("patrol1", c2, j1)
    if c2 != 201 or not j1.get("recon_uid"):
        return 1

    body2 = {
        "action": "spawn_patrol",
        "route_append": True,
        "append_recon_uid": j1["recon_uid"],
        "pos_x": 15080.0,
        "pos_y": 5.0,
        "pos_z": 16680.0,
        "route_points": [{"pos_x": 15900.0, "pos_y": 5.0, "pos_z": 16900.0}],
        "veh_count": 2,
        "vehicle_class": "3AS_AAT_tan",
        "npc_class": "JLTS_Droid_B1_E5",
    }
    c3, j2 = _req(base, "POST", "/api/map/admin/action", body2, h)
    print("patrol_append", c3, j2)
    return 0 if c3 == 201 else 1


if __name__ == "__main__":
    raise SystemExit(main())
