"""Patrol + convoy + delete_zone; poll DB.

Payloads must match app.py / mission pipe format (not raw JSON).

Run:
  py -3 map_api/tools/_test_delete_zone_run.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

_map_api_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_map_api_root.parent))

if _map_api_root.joinpath("local.env").exists():
    import os

    for line in _map_api_root.joinpath("local.env").read_text(encoding="utf-8", errors="replace").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))

from map_api.db import insert_returning_id, query_all


def main() -> int:
    server_id = 1
    px, py, pz = 12000.0, 0.0, 8500.0
    route = "12000~8500;12100~8550;12050~8600"
    payload_patrol = (
        f"{px}|{py}|{pz}|route={route}|veh_count=2|veh_class=3AS_AAT_tan|npc_class=JLTS_Droid_B1_E5|recon_uid=pytest01"
    )[:7800]
    payload_convoy = (
        f"{px}|{py}|{pz}|route={route}|veh_count=1|veh_class=3AS_AAT_tan|recon_uid=pytest02"
    )[:7800]
    payload_del = f"{px}|{py}|{pz}"

    def ins(action: str, payload: str) -> int:
        sql = """INSERT INTO arma_map_admin_actions
            (server_id, steam_id, action, payload, state)
            VALUES (%s, 'SERVER', %s, %s, 'pending')"""
        aid = insert_returning_id(sql, (server_id, action, payload))
        print("INSERT", action, "id", aid)
        return aid

    ins("spawn_patrol", payload_patrol)
    time.sleep(6)
    ins("spawn_convoy", payload_convoy)
    time.sleep(32)
    del_id = ins("delete_zone", payload_del)

    for _ in range(22):
        time.sleep(4)
        rows = query_all(
            """SELECT id, action, state, LEFT(payload, 70) AS pl
            FROM arma_map_admin_actions
            WHERE server_id = %s ORDER BY id DESC LIMIT 10""",
            (server_id,),
        )
        print("---", time.strftime("%H:%M:%S"))
        for r in rows:
            print(r)
        st = query_all(
            "SELECT state FROM arma_map_admin_actions WHERE id = %s AND server_id = %s LIMIT 1",
            (del_id, server_id),
        )
        del_st = st[0]["state"] if st else None
        if del_st == "done":
            print("DELETE_ZONE DONE")
            return 0
        if del_st == "failed":
            print("DELETE_ZONE FAILED")
            return 1

    print("timeout")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
