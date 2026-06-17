"""
Запуск из корня репозитория:
  pip install -r requirements.txt
  set DB_HOST=... & set DB_USER=... & set DB_PASSWORD=... & set DB_NAME=...
  python -m map_api.app
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from uuid import uuid4
from datetime import datetime

from flask import Flask, Response, jsonify, render_template, request

from map_api.config import (
    DEFAULT_SERVER_ID,
    MAP_API_ADMIN_SECRET,
    MAP_ARMA3MAP_BASE_URL,
    MAP_ARMA3MAP_MAP_KEY,
    MAP_CLIP_OBJECTS_OFF_WORLD,
    MAP_CLIP_UNITS_OFF_WORLD,
    MAP_CLIP_VEHICLES_OFF_WORLD,
    MAP_CLIP_WORLD_MARGIN,
    MAP_ENTITY_STALE_SECONDS,
    MAP_LIVE_META_STALE_SECONDS,
    MAP_PLAYER_STALE_SECONDS,
    MAP_GRID_STEP,
    MAP_MARKER_POLYLINE_STEP_M,
    MAP_MARKER_ROT_SIGN,
    MAP_MARKER_SHAPE_SCALE,
    MAP_MAX_ZOOM,
    MAP_OBJECTS_HIDE_CLASSNAME_SUBSTR,
    MAP_OBJECTS_SWAP_PLANE_AXES,
    MAP_OVERLAY_URL,
    MAP_POLL_MS,
    MAP_PUBLIC_ORIGIN,
    MAP_RCON_ENABLED,
    MAP_RCON_HOST,
    MAP_RCON_PASSWORD,
    MAP_RCON_PORT,
    MAP_RCON_TIMEOUT_SEC,
    MAP_USE_ARMA3MAP_TILES,
    MAP_WHEEL_PX_PER_ZOOM_LEVEL,
    MAP_WORLD_SIZE,
)
from map_api.db import insert_returning_id, mutate, query_all
from map_api.map_filters import (
    object_classname_hidden,
    parse_hide_classname_needles,
    row_is_headless_map_name,
    row_is_stale,
    row_outside_world_bounds,
)
from map_api import rcon_service
from map_api.schema_bootstrap import ensure_map_addon_tables

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["JSON_SORT_KEYS"] = False

_map_addon_bootstrapped = False
_map_addon_bootstrap_ran = False

_OBJECT_HIDE_NEEDLES = parse_hide_classname_needles(MAP_OBJECTS_HIDE_CLASSNAME_SUBSTR)

DISCORD_BRIDGE_URL = os.environ.get("MAP_DISCORD_BRIDGE_URL", "http://127.0.0.1:8765/api/recon/outpost").strip()
DISCORD_BRIDGE_TOKEN = os.environ.get("MAP_DISCORD_BRIDGE_TOKEN", "").strip()

_SPAWNABLE_TEMPLATES: dict[str, tuple[str, int]] = {
    "avanpost_1": ("Аванпост", 30),
    "avanpost_2": ("Аванпост", 40),
    "avanpost_3": ("Аванпост", 40),
    "avanpost_4": ("Аванпост", 40),
    "avanpost_5": ("Аванпост", 40),
    "avanpost_6": ("Аванпост", 40),
    "avanpost_7": ("Аванпост", 40),
    "avanpost_8": ("Аванпост", 40),
    "avanpost_9": ("Аванпост", 40),
    "avanpost_10": ("Аванпост", 40),
    "avanpost_heavy": ("Тяжелый аванпост", 90),
    "forpost_kns": ("Форпост КНС", 110),
    "kpp_cis_checkpoint": ("КПП [CIS]", 42),
}


def _grid_square_label(pos_x: float, pos_z: float) -> str:
    gx = int(max(0.0, pos_x) // 1000.0)
    gz = int(max(0.0, pos_z) // 1000.0)
    return f"{gx:02d}-{gz:02d}"


def _template_vertices(pos_x: float, pos_z: float, radius_m: float) -> dict[str, tuple[float, float]]:
    r = max(20.0, float(radius_m))
    return {
        "NW": (pos_x - r, pos_z + r),
        "NE": (pos_x + r, pos_z + r),
        "SE": (pos_x + r, pos_z - r),
        "SW": (pos_x - r, pos_z - r),
    }


def _discord_bridge_publish_outpost(
    *,
    server_id: int,
    zone_uid: str,
    template_zone_id: str,
    pos_x: float,
    pos_y: float,
    pos_z: float,
    radius_a: float,
    radius_b: float,
) -> None:
    if not DISCORD_BRIDGE_URL:
        return
    tpl_name, enemies = _SPAWNABLE_TEMPLATES.get(
        template_zone_id, ("Активность", 30)
    )
    square = _grid_square_label(pos_x, pos_z)
    verts = _template_vertices(pos_x, pos_z, max(radius_a, radius_b))
    _ou = (MAP_OVERLAY_URL or "").strip()
    if _ou.startswith("/") and MAP_PUBLIC_ORIGIN:
        _ou = MAP_PUBLIC_ORIGIN + _ou
    payload = {
        "token": DISCORD_BRIDGE_TOKEN,
        "event_id": str(uuid4()),
        "server_id": int(server_id),
        "zone_uid": str(zone_uid),
        "template_zone_id": str(template_zone_id),
        "template_name": tpl_name,
        "event_type": "outpost",
        "pos_x": float(pos_x),
        "pos_y": float(pos_y),
        "pos_z": float(pos_z),
        "square": square,
        "enemy_estimate": int(enemies),
        "map_world_size": float(MAP_WORLD_SIZE),
        "map_overlay_url": _ou or None,
        "vertices": {
            "nw": {"x": round(verts["NW"][0], 1), "z": round(verts["NW"][1], 1)},
            "ne": {"x": round(verts["NE"][0], 1), "z": round(verts["NE"][1], 1)},
            "se": {"x": round(verts["SE"][0], 1), "z": round(verts["SE"][1], 1)},
            "sw": {"x": round(verts["SW"][0], 1), "z": round(verts["SW"][1], 1)},
        },
    }
    req = urllib.request.Request(
        DISCORD_BRIDGE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0):
            pass
    except (urllib.error.URLError, TimeoutError):
        # Бридж необязателен: если бот/HTTP не поднят, спавн зоны всё равно успешен.
        pass


def _route_report_radius_m(points: list[dict[str, float]]) -> float:
    """Радиус «зоны интереса» от точки спавна (первая точка) до дальнего вейпоинта + буфер."""
    if len(points) < 2:
        return 400.0
    cx = float(points[0]["pos_x"])
    cz = float(points[0]["pos_z"])
    r = 0.0
    for p in points:
        dx = float(p["pos_x"]) - cx
        dz = float(p["pos_z"]) - cz
        r = max(r, math.sqrt(dx * dx + dz * dz))
    return float(min(max(200.0, round(r + 120.0, -1)), 15000.0))


def _discord_bridge_publish_route(
    *,
    server_id: int,
    action: str,
    points: list[dict[str, float]],
    enemy_estimate: int,
    zone_uid: str | None = None,
    veh_count: int | None = None,
) -> None:
    if not DISCORD_BRIDGE_URL or len(points) < 2:
        return
    z_uid = str(zone_uid).strip() if zone_uid else ""
    if not z_uid:
        z_uid = f"{action}_{int(datetime.utcnow().timestamp())}"
    report_r = _route_report_radius_m(points)
    vc = int(veh_count) if veh_count is not None else (3 if action == "spawn_convoy" else 0)
    marker_names: list[str] = ["Старт"]
    for i in range(1, min(len(points), 8)):
        j = i - 1
        marker_names.append(chr(ord("A") + j) if j < 26 else f"P{i}")
    _ou = (MAP_OVERLAY_URL or "").strip()
    if _ou.startswith("/") and MAP_PUBLIC_ORIGIN:
        _ou = MAP_PUBLIC_ORIGIN + _ou
    payload = {
        "token": DISCORD_BRIDGE_TOKEN,
        "event_id": str(uuid4()),
        "server_id": int(server_id),
        "zone_uid": z_uid,
        "template_zone_id": action,
        "template_name": "Разведка Колонна" if action == "spawn_convoy" else "Разведка Патруль",
        "event_type": "convoy" if action == "spawn_convoy" else "patrol",
        "pos_x": float(points[0]["pos_x"]),
        "pos_y": float(points[0]["pos_y"]),
        "pos_z": float(points[0]["pos_z"]),
        "square": _grid_square_label(float(points[0]["pos_x"]), float(points[0]["pos_z"])),
        "enemy_estimate": int(max(1, enemy_estimate)),
        "report_radius_m": report_r,
        "veh_count": int(vc) if action == "spawn_convoy" else 0,
        "n_route_points": int(len(points)),
        "map_world_size": float(MAP_WORLD_SIZE),
        "map_overlay_url": _ou or None,
        "vertices": {
            "a": {"x": round(float(points[0]["pos_x"]), 1), "z": round(float(points[0]["pos_z"]), 1)},
            "b": {"x": round(float(points[-1]["pos_x"]), 1), "z": round(float(points[-1]["pos_z"]), 1)},
        },
        "marker_positions": [
            {
                "name": marker_names[i] if i < len(marker_names) else str(i),
                "x": round(float(p["pos_x"]), 1),
                "z": round(float(p["pos_z"]), 1),
            }
            for i, p in enumerate(points[:8])
        ],
    }
    req = urllib.request.Request(
        DISCORD_BRIDGE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0):
            pass
    except (urllib.error.URLError, TimeoutError):
        pass


def _discord_bridge_retract_url() -> str:
    """Тот же хост, что и для публикации разведки; путь /api/recon/retract у HTTP-бриджа (recon_bot)."""
    return DISCORD_BRIDGE_URL.replace("/api/recon/outpost", "/api/recon/retract")


def _discord_bridge_retract_zone(zone_uid: str) -> None:
    """Удалить сообщение разведки в Discord по zone_uid (бот хранит message id после отправки)."""
    zu = str(zone_uid or "").strip()
    if not zu or not DISCORD_BRIDGE_TOKEN:
        return
    payload = {"token": DISCORD_BRIDGE_TOKEN, "zone_uid": zu}
    req = urllib.request.Request(
        _discord_bridge_retract_url(),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0):
            pass
    except (urllib.error.URLError, TimeoutError):
        pass


def _extract_pipe_option(payload: str, key: str) -> str | None:
    if not payload:
        return None
    for part in str(payload).split("|"):
        if "=" not in part:
            continue
        k, _, v = part.partition("=")
        if k.strip() == key:
            out = v.strip()
            return out if out else None
    return None


def _create_recon_drawing(
    *,
    server_id: int,
    shape_type: str,
    team_color: str,
    label: str,
    arma_points: list[list[float]],
) -> None:
    if len(arma_points) < 2:
        return
    latlng_path = [[float(p[2]), float(p[0])] for p in arma_points]
    arma_clean = [{"pos_x": float(p[0]), "pos_y": float(p[1]), "pos_z": float(p[2])} for p in arma_points]
    geom = json.dumps({"path": latlng_path, "arma": arma_clean}, ensure_ascii=False)
    pts = _downsample_points(_drawing_arma_points_from_geom({"path": latlng_path, "arma": arma_clean}), 96)
    arma_pts_pipe = _triplets_to_pipe(pts) if len(pts) >= 2 else ""
    try:
        insert_returning_id(
            """
            INSERT INTO arma_map_drawings (server_id, map_variant, shape_type, team_color, geom_json, label, arma_pts_pipe)
            VALUES (%s, 'tactical', %s, %s, %s, %s, %s)
            """,
            (server_id, shape_type, team_color, geom, label[:256], arma_pts_pipe or None),
        )
    except Exception:
        pass


def _geom_center_xz(geom_raw: object) -> tuple[float, float] | None:
    g = _drawing_geom_to_dict(geom_raw)
    pts = _drawing_arma_points_from_geom(g)
    if not pts:
        return None
    sx = 0.0
    sz = 0.0
    n = 0
    for p in pts:
        if len(p) < 3:
            continue
        sx += float(p[0])
        sz += float(p[2])
        n += 1
    if n <= 0:
        return None
    return (sx / n, sz / n)


def _delete_recon_drawings_near(
    *,
    server_id: int,
    pos_x: float,
    pos_z: float,
    labels: set[str] | None = None,
    radius_m: float = 260.0,
) -> int:
    labels = labels or {"Разведка Аванпост", "Разведка Колонна", "Разведка Патруль"}
    rows = query_all(
        "SELECT id, label, geom_json FROM arma_map_drawings WHERE server_id = %s ORDER BY id DESC LIMIT 1200",
        (server_id,),
    )
    to_delete: list[int] = []
    r2 = float(radius_m) * float(radius_m)
    for r in rows:
        lbl = str(r.get("label") or "")
        if lbl not in labels:
            continue
        c = _geom_center_xz(r.get("geom_json"))
        if not c:
            continue
        dx = c[0] - float(pos_x)
        dz = c[1] - float(pos_z)
        if (dx * dx + dz * dz) <= r2:
            to_delete.append(int(r["id"]))
    if not to_delete:
        return 0
    removed = 0
    for did in to_delete:
        removed += mutate("DELETE FROM arma_map_drawings WHERE server_id = %s AND id = %s", (server_id, did))
    return removed


def _filter_entity_rows(rows: list[dict], *, kind: str) -> list[dict]:
    """kind: players | vehicles | units — stale по updated_at; опционально клип за пределами мира."""
    stale_sec = (
        MAP_PLAYER_STALE_SECONDS if kind == "players" else MAP_ENTITY_STALE_SECONDS
    )
    out: list[dict] = []
    for r in rows:
        if kind in ("players", "units") and row_is_headless_map_name(r):
            continue
        if row_is_stale(r, stale_sec):
            continue
        clip = False
        if kind == "vehicles" and MAP_CLIP_VEHICLES_OFF_WORLD:
            clip = row_outside_world_bounds(
                r, MAP_WORLD_SIZE, MAP_OBJECTS_SWAP_PLANE_AXES, MAP_CLIP_WORLD_MARGIN
            )
        elif kind == "units" and MAP_CLIP_UNITS_OFF_WORLD:
            clip = row_outside_world_bounds(
                r, MAP_WORLD_SIZE, MAP_OBJECTS_SWAP_PLANE_AXES, MAP_CLIP_WORLD_MARGIN
            )
        if clip:
            continue
        out.append(r)
    return out


def _filter_object_rows(rows: list[dict]) -> list[dict]:
    out: list[dict] = []
    for r in rows:
        cls = str(r.get("classname") or "")
        if _OBJECT_HIDE_NEEDLES and object_classname_hidden(cls, _OBJECT_HIDE_NEEDLES):
            continue
        if MAP_CLIP_OBJECTS_OFF_WORLD and row_outside_world_bounds(
            r, MAP_WORLD_SIZE, MAP_OBJECTS_SWAP_PLANE_AXES, MAP_CLIP_WORLD_MARGIN
        ):
            continue
        out.append(r)
    return out


def _map_meta_row(server_id: int) -> dict | None:
    rows = query_all(
        "SELECT * FROM arma_map_meta WHERE server_id = %s LIMIT 1",
        (server_id,),
    )
    return rows[0] if rows else None


def _map_live_layer_suppressed(server_id: int) -> bool:
    """Нет пульса mapLive в arma_map_meta — не отдаём слой с игры (остаток в БД). Возраст — по часам MySQL."""
    if MAP_LIVE_META_STALE_SECONDS <= 0:
        return False
    rows = query_all(
        "SELECT TIMESTAMPDIFF(SECOND, updated_at, NOW(3)) AS age_sec "
        "FROM arma_map_meta WHERE server_id = %s LIMIT 1",
        (server_id,),
    )
    if not rows:
        return True
    age = rows[0].get("age_sec")
    if age is None:
        return True
    try:
        return float(age) > float(MAP_LIVE_META_STALE_SECONDS)
    except (TypeError, ValueError):
        return True


def _map_meta_row_and_pulse_age(server_id: int) -> tuple[dict | None, float | None]:
    """Строка meta без служебных полей и возраст updated_at в секундах (TIMESTAMPDIFF в MySQL)."""
    if MAP_LIVE_META_STALE_SECONDS <= 0:
        m = _map_meta_row(server_id)
        return (m, None)
    rows = query_all(
        "SELECT *, TIMESTAMPDIFF(SECOND, updated_at, NOW(3)) AS __pulse_sec "
        "FROM arma_map_meta WHERE server_id = %s LIMIT 1",
        (server_id,),
    )
    if not rows:
        return (None, None)
    d = dict(rows[0])
    pulse = d.pop("__pulse_sec", None)
    try:
        age_f = float(pulse) if pulse is not None else None
    except (TypeError, ValueError):
        age_f = None
    return (d, age_f)


@app.before_request
def _bootstrap_map_addon_tables() -> None:
    global _map_addon_bootstrapped, _map_addon_bootstrap_ran
    if _map_addon_bootstrap_ran:
        return
    if request.endpoint == "static":
        return
    _map_addon_bootstrap_ran = True
    try:
        ensure_map_addon_tables()
        _map_addon_bootstrapped = True
    except Exception:
        app.logger.exception(
            "ensure_map_addon_tables (проверьте DB_* и map_api/local.env; "
            "после исправления перезапустите процесс)"
        )


def _server_id() -> int:
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.is_json:
        body = request.get_json(silent=True) or {}
        if body.get("server_id") is not None:
            try:
                return int(body["server_id"])
            except (TypeError, ValueError):
                pass
    try:
        return int(request.args.get("server_id", DEFAULT_SERVER_ID))
    except (TypeError, ValueError):
        return DEFAULT_SERVER_ID


def _serialize_row(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _write_authorized() -> bool:
    secret = os.environ.get("MAP_API_WRITE_SECRET", "").strip()
    if not secret:
        return True
    if secrets.compare_digest(
        request.headers.get("X-Map-Write-Key", ""),
        secret,
    ):
        return True
    if MAP_API_ADMIN_SECRET and secrets.compare_digest(
        request.headers.get("X-Map-Admin-Key", ""),
        MAP_API_ADMIN_SECRET,
    ):
        return True
    return False


def _admin_authorized() -> bool:
    """Админ-действия доступны без отдельного ключа из веб-панели."""
    return True


def _map_api_repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _service_restart_configured() -> bool:
    return bool(
        os.environ.get("MAP_API_WRITE_SECRET", "").strip() or MAP_API_ADMIN_SECRET
    )


def _service_restart_authorized() -> bool:
    if not _service_restart_configured():
        return False
    w = os.environ.get("MAP_API_WRITE_SECRET", "").strip()
    if w and secrets.compare_digest(
        request.headers.get("X-Map-Write-Key", ""),
        w,
    ):
        return True
    if MAP_API_ADMIN_SECRET and secrets.compare_digest(
        request.headers.get("X-Map-Admin-Key", ""),
        MAP_API_ADMIN_SECRET,
    ):
        return True
    return False


def _trigger_service_restart() -> tuple[bool, str]:
    root = _map_api_repo_root()
    cmd_root = root / "run_map_api.cmd"
    if not cmd_root.is_file():
        alt = root / "map_api" / "run_map_api.cmd"
        if not alt.is_file():
            return False, "Не найден run_map_api.cmd в корне репозитория"
    worker = Path(__file__).resolve().parent / "restart_worker.py"
    if not worker.is_file():
        return False, "Не найден map_api/restart_worker.py"
    pid = os.getpid()
    try:
        if os.name == "nt":
            cf = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS  # type: ignore[attr-defined]
            subprocess.Popen(
                [sys.executable, str(worker), str(pid), str(root)],
                creationflags=cf,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
            )
        else:
            subprocess.Popen(
                [sys.executable, str(worker), str(pid), str(root)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                close_fds=True,
                start_new_session=True,
            )
    except OSError as e:
        return False, str(e)
    return True, ""


def _clamp_coord(name: str, value: float) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    v = float(value)
    margin = MAP_WORLD_SIZE * 2
    if v < -margin or v > margin:
        return None
    return v


def _sanitize_marker_type(value: str) -> str:
    s = (value or "hd_pickup").strip()[:64]
    if not re.match(r"^[A-Za-z0-9_]+$", s):
        return "hd_pickup"
    return s


def _sanitize_color(value: str) -> str:
    s = (value or "ColorCIV").strip()[:32]
    if not re.match(r"^[A-Za-z0-9_]+$", s):
        return "ColorCIV"
    return s


def _sanitize_team_color(value: str) -> str:
    s = (value or "blue").strip().lower()
    return s if s in ("blue", "red") else "blue"


def _sanitize_map_variant(value: str) -> str:
    s = (value or "eventology").strip().lower()
    return s if s in ("tactical", "eventology") else "eventology"


def _sanitize_shape_type(value: str) -> str:
    s = (value or "polygon").strip().lower()
    if s in ("polygon", "polyline", "freehand", "arrow"):
        return s
    return "polygon"


def _sanitize_order_kind(value: str) -> str | None:
    s = (value or "").strip().lower()
    if s in ("veh", "vehicle", "v"):
        return "veh"
    if s in ("unit", "u", "ai"):
        return "unit"
    return None


def _sanitize_order_type(value: str) -> str:
    s = (value or "move").strip().lower()
    return s if s in ("move",) else "move"


def _sanitize_template_zone_id(value: str) -> str | None:
    s = (value or "").strip()[:64]
    if not s or not re.match(r"^[A-Za-z0-9_]+$", s):
        return None
    return s


def _sanitize_zone_uid(value: str) -> str | None:
    """Уникальный id аванпоста для игры и API: буква в начале, далее буквы/цифры/_/-, 4–64 символа."""
    s = (value or "").strip()
    if len(s) < 4 or len(s) > 64:
        return None
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9_-]{3,63}$", s):
        return None
    return s


def _generate_zone_uid() -> str:
    return f"rim_ap_{secrets.token_hex(12)}"


def _clamp_trigger_radius(value: object, default: float) -> float | None:
    if value is None:
        return default
    if not isinstance(value, (int, float)):
        return None
    r = float(value)
    if r <= 0 or r > 2500:
        return None
    return r


def _sanitize_net_id(value: str) -> str | None:
    s = (value or "").strip()[:96]
    if not s or not re.match(r"^[A-Za-z0-9:_-]+$", s):
        return None
    return s


def _sanitize_steam_id(value: str) -> str | None:
    s = (value or "").strip()[:32]
    if not re.match(r"^[0-9a-zA-Z:_-]+$", s):
        return None
    return s


def _sanitize_admin_action(value: str) -> str | None:
    s = (value or "").strip().lower()
    if s in (
        "kick",
        "ban",
        "message",
        "lightning",
        "grant_zeus",
        "teleport",
        "slay",
        "artillery",
        "delete_zone",
        "assault_zone",
        "start_quest",
        "spawn_convoy",
        "spawn_patrol",
    ):
        return s
    return None


def _sanitize_message_channel(value: str) -> str:
    s = (value or "hint").strip().lower()
    aliases = {
        "system chat": "system_chat",
        "systemchat": "system_chat",
        "introtext": "introtext",
        "intro_text": "introtext",
        "intro": "introtext",
        "bis_dynamic_text": "bis_dynamic_text",
        "bis_dinamic_text": "bis_dynamic_text",
        "dynamic_text": "bis_dynamic_text",
        "subtitle": "subtitle",
        "title": "title",
        "hint": "hint",
    }
    s = aliases.get(s, s)
    if s in ("hint", "system_chat", "title", "introtext", "subtitle", "bis_dynamic_text"):
        return s
    return "hint"


def _admin_action_payload(action: str, data: dict) -> str | None:
    if action == "message":
        text = str(data.get("message", ""))[:900]
        ch = _sanitize_message_channel(str(data.get("message_channel", "hint")))
        return f"{ch}\n{text}"[:1000]
    if action in ("teleport", "artillery", "delete_zone", "assault_zone", "spawn_convoy", "spawn_patrol"):
        px = _clamp_coord("pos_x", data.get("pos_x", data.get("x")))
        py = _clamp_coord("pos_y", data.get("pos_y", data.get("y")))
        pz = _clamp_coord("pos_z", data.get("pos_z", data.get("z")))
        if px is None or py is None or pz is None:
            return None
        if action == "artillery":
            shell_raw = str(data.get("shell", "Sh_82mm_AMOS")).strip()
            shell = shell_raw if re.match(r"^[A-Za-z0-9_]+$", shell_raw) else "Sh_82mm_AMOS"
            try:
                radius = float(data.get("radius", 20))
            except (TypeError, ValueError):
                radius = 20.0
            try:
                count = int(data.get("count", 8))
            except (TypeError, ValueError):
                count = 8
            radius = max(1.0, min(radius, 500.0))
            count = max(1, min(count, 100))
            return f"{px}|{py}|{pz}|shell={shell}|radius={radius}|count={count}"[:1000]
        if action == "assault_zone":
            try:
                delay_sec = int(data.get("delay_sec", data.get("delay", 0)))
            except (TypeError, ValueError):
                delay_sec = 0
            try:
                severity = int(data.get("severity", 1))
            except (TypeError, ValueError):
                severity = 1
            try:
                inf_count = int(data.get("inf_count", data.get("attack_npc", 0)))
            except (TypeError, ValueError):
                inf_count = 0
            try:
                veh_count = int(data.get("veh_count", data.get("attack_vehicles", 0)))
            except (TypeError, ValueError):
                veh_count = 0
            try:
                art_count = int(data.get("art_count", data.get("attack_shells", 0)))
            except (TypeError, ValueError):
                art_count = 0
            shell_raw = str(data.get("shell", "Sh_82mm_AMOS")).strip()
            shell = shell_raw if re.match(r"^[A-Za-z0-9_]+$", shell_raw) else "Sh_82mm_AMOS"
            try:
                attack_dir = float(data.get("attack_dir", -1))
            except (TypeError, ValueError):
                attack_dir = -1.0
            try:
                art_reach = float(data.get("art_reach", 0))
            except (TypeError, ValueError):
                art_reach = 0.0
            delay_sec = max(0, min(delay_sec, 7200))
            severity = max(1, min(severity, 3))
            inf_count = max(0, min(inf_count, 120))
            veh_count = max(0, min(veh_count, 20))
            art_count = max(0, min(art_count, 80))
            if attack_dir < 0:
                attack_dir = -1.0
            else:
                attack_dir = float(attack_dir % 360.0)
            art_reach = max(0.0, min(art_reach, 1200.0))
            return (
                f"{px}|{py}|{pz}|delay={delay_sec}|severity={severity}"
                f"|inf={inf_count}|veh={veh_count}|art={art_count}|shell={shell}"
                f"|dir={round(attack_dir,1)}|art_reach={round(art_reach,1)}"
            )[:1000]
        if action in ("spawn_convoy", "spawn_patrol"):
            route_append = bool(data.get("route_append"))
            append_uid = str(data.get("append_recon_uid", "")).strip()
            route_raw = data.get("route_points", [])
            pts: list[str] = []
            if isinstance(route_raw, list):
                for pt in route_raw[:32]:
                    if not isinstance(pt, dict):
                        continue
                    rx = _clamp_coord("route_x", pt.get("pos_x", pt.get("x")))
                    rz = _clamp_coord("route_z", pt.get("pos_z", pt.get("z")))
                    if rx is None or rz is None:
                        continue
                    pts.append(f"{int(round(float(rx)))}~{int(round(float(rz)))}")
            app.logger.info(f"[ROUTE_DEBUG] action={action}, px={px}, py={py}, pz={pz}, route_points_count={len(route_raw)}, first_pt={route_raw[0] if route_raw else None}")
            veh_cls_raw = str(data.get("vehicle_class", "3AS_AAT_tan")).strip()
            veh_cls = veh_cls_raw if re.match(r"^[A-Za-z0-9_]+$", veh_cls_raw) else "3AS_AAT_tan"
            try:
                veh_count = int(data.get("veh_count", data.get("vehicle_count", 3)))
            except (TypeError, ValueError):
                veh_count = 3
            veh_count = max(1, min(veh_count, 20))
            build_tpl = _sanitize_template_zone_id(str(data.get("build_template", ""))) or ""
            npc_cls_raw = str(data.get("npc_class", "JLTS_Droid_B1_E5")).strip()
            npc_cls = npc_cls_raw if re.match(r"^[A-Za-z0-9_]+$", npc_cls_raw) else "JLTS_Droid_B1_E5"
            if route_append:
                if not append_uid or not re.fullmatch(
                    r"(?i)^[a-f0-9]{8,64}$", append_uid
                ):
                    return None
                if len(pts) < 1:
                    return None
                payload = (
                    f"{px}|{py}|{pz}|route={';'.join(pts)}|route_append=1|veh_count={veh_count}|veh_class={veh_cls}"
                )
                if action == "spawn_patrol":
                    payload += f"|npc_class={npc_cls}"
                payload += f"|recon_uid={append_uid}"
                return payload[:7800]
            if len(pts) < 2:
                return None
            pts_move = pts[1:]
            if not pts_move:
                return None
            payload = f"{px}|{py}|{pz}|route={';'.join(pts_move)}|veh_count={veh_count}|veh_class={veh_cls}"
            app.logger.info(f"[ROUTE_DEBUG] payload header: {px}|{py}|{pz}, route_move_pts: {';'.join(pts_move[:3])}...")
            if build_tpl:
                payload += f"|build={build_tpl}"
            if action == "spawn_patrol":
                payload += f"|npc_class={npc_cls}"
            recon_uid = str(data.get("recon_uid", "")).strip()
            if not recon_uid or not re.fullmatch(r"(?i)^[a-f0-9]{8,64}$", recon_uid):
                recon_uid = uuid4().hex
            payload += f"|recon_uid={recon_uid}"
            return payload[:7800]
        return f"{px}|{py}|{pz}"[:1000]
    if action == "start_quest":
        q = str(data.get("quest_script", data.get("payload", ""))).strip()
        if not re.match(r"^[A-Za-z0-9_.-]{3,96}\.sqf$", q):
            return None
        px = _clamp_coord("pos_x", data.get("pos_x", data.get("x")))
        py = _clamp_coord("pos_y", data.get("pos_y", data.get("y")))
        pz = _clamp_coord("pos_z", data.get("pos_z", data.get("z")))
        if px is None or py is None or pz is None:
            return q
        return f"{q}|{px}|{py}|{pz}"[:1000]
    return str(data.get("message", data.get("payload", "")))[:1000] or None


def _drawing_geom_to_dict(raw: object) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def _drawing_arma_points_from_geom(g: dict) -> list[list[float]]:
    arma = g.get("arma")
    if isinstance(arma, list) and arma:
        out: list[list[float]] = []
        for p in arma:
            if isinstance(p, dict):
                out.append(
                    [
                        float(p.get("pos_x") or 0),
                        float(p.get("pos_y") or 0),
                        float(p.get("pos_z") or 0),
                    ]
                )
        if out:
            return out
    path = g.get("path") or []
    out2: list[list[float]] = []
    for p in path:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            lat, lng = float(p[0]), float(p[1])
            # Как на веб-карте с Arma3Map: lat=z_мира, lng=x_мира (см. map.html latLngToArma).
            out2.append([lng, 0.0, lat])
    return out2


def _downsample_points(pts: list[list[float]], max_n: int) -> list[list[float]]:
    if len(pts) <= max_n:
        return pts
    step = (len(pts) - 1) / (max_n - 1)
    out: list[list[float]] = []
    for i in range(max_n):
        idx = int(round(i * step))
        if idx >= len(pts):
            idx = len(pts) - 1
        out.append(pts[idx])
    return out


def _format_sqf_number(x: float) -> str:
    if abs(x - round(x)) < 1e-4:
        return str(int(round(x)))
    s = f"{x:.3f}"
    return s.rstrip("0").rstrip(".")


def _triplets_to_sqf_array(triplets: list[list[float]]) -> str:
    chunks: list[str] = []
    for t in triplets:
        chunks.append("[" + ",".join(_format_sqf_number(v) for v in t) + "]")
    return "[" + ",".join(chunks) + "]"


def _triplets_to_pipe(triplets: list[list[float]]) -> str:
    """x|y|z|x|y|z — без запятых между числами группы (extDB3 parseSimpleArray)."""
    parts: list[str] = []
    for t in triplets:
        for v in t[:3]:
            parts.append(_format_sqf_number(v))
    return "|".join(parts)


def _admin_payload_to_pos(payload: str) -> tuple[float, float, float] | None:
    s = str(payload or "").strip()
    if not s:
        return None
    parts = s.split("|")
    if len(parts) < 3:
        return None
    try:
        return (float(parts[0]), float(parts[1]), float(parts[2]))
    except (TypeError, ValueError):
        return None


def _patch_spawn_route_payload(
    payload: str,
    *,
    vehicle_class: str | None = None,
    npc_class: str | None = None,
) -> str | None:
    """Меняет veh_class / npc_class в payload spawn_convoy|spawn_patrol (pending в очереди)."""
    s = str(payload or "").strip()
    if not s:
        return None
    parts = s.split("|")
    if len(parts) < 4:
        return None
    opts: dict[str, str] = {}
    for seg in parts[3:]:
        if "=" not in seg:
            continue
        k, _, v = seg.partition("=")
        opts[k.strip().lower()] = v.strip()
    if "route" not in opts:
        return None
    if vehicle_class is not None:
        vc = str(vehicle_class).strip()
        if re.match(r"^[A-Za-z0-9_]+$", vc):
            opts["veh_class"] = vc
    if npc_class is not None:
        nc = str(npc_class).strip()
        if re.match(r"^[A-Za-z0-9_]+$", nc):
            opts["npc_class"] = nc
    head = parts[:3]
    tail = [f"{k}={v}" for k, v in opts.items()]
    out = "|".join(head + tail)
    return out[:7800]


def _pipe_to_triplets(s: str) -> list[list[float]]:
    if not isinstance(s, str) or not s.strip():
        return []
    parts = [p for p in s.split("|") if p.strip() != ""]
    out: list[list[float]] = []
    for i in range(0, len(parts) - 2, 3):
        try:
            out.append([float(parts[i]), float(parts[i + 1]), float(parts[i + 2])])
        except (ValueError, IndexError):
            break
    return out


def _sqf_escape_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _validate_latlng_path(raw: object, max_pts: int = 600) -> list[list[float]] | None:
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    out: list[list[float]] = []
    for pt in raw[:max_pts]:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            return None
        lat = float(pt[0])
        lng = float(pt[1])
        margin = float(MAP_WORLD_SIZE) * 3
        if lat < -margin or lat > margin or lng < -margin or lng > margin:
            return None
        out.append([lat, lng])
    return out


def _render_map_page(page_mode: str) -> str:
    return render_template(
        "map.html",
        page_mode=page_mode,
        map_world_size=MAP_WORLD_SIZE,
        default_server_id=DEFAULT_SERVER_ID,
        write_key_required=bool(os.environ.get("MAP_API_WRITE_SECRET", "").strip()),
        admin_secret_configured=bool(MAP_API_ADMIN_SECRET),
        atlas_url=os.environ.get(
            "MAP_ATLAS_REFERENCE_URL",
            "https://atlas.plan-ops.fr/maps/arma3/kapaulio",
        ),
        map_grid_step=MAP_GRID_STEP,
        map_overlay_url=MAP_OVERLAY_URL,
        map_poll_ms=MAP_POLL_MS,
        map_max_zoom=MAP_MAX_ZOOM,
        map_marker_shape_scale=MAP_MARKER_SHAPE_SCALE,
        map_marker_poly_step=MAP_MARKER_POLYLINE_STEP_M,
        map_marker_rot_sign=MAP_MARKER_ROT_SIGN,
        map_wheel_px_per_zoom=MAP_WHEEL_PX_PER_ZOOM_LEVEL,
        use_arma3map_tiles=MAP_USE_ARMA3MAP_TILES,
        arma3map_base_url=MAP_ARMA3MAP_BASE_URL,
        arma3map_map_key=MAP_ARMA3MAP_MAP_KEY,
        objects_swap_plane_axes=MAP_OBJECTS_SWAP_PLANE_AXES,
        rcon_enabled=MAP_RCON_ENABLED,
        map_api_port=int(os.environ.get("MAP_API_PORT", "5050")),
        service_restart_configured=_service_restart_configured(),
    )


@app.get("/rcon")
def rcon_console_page():
    """Веб-консоль BattlEye RCON (обход недоступного HTTP до игры)."""
    return render_template(
        "rcon.html",
        rcon_enabled=MAP_RCON_ENABLED,
        rcon_host=MAP_RCON_HOST,
        rcon_port=MAP_RCON_PORT,
        admin_secret_configured=bool(MAP_API_ADMIN_SECRET),
        berconpy_ok=rcon_service.berconpy_installed(),
    )


@app.post("/api/map/rcon")
def api_map_rcon():
    """
    Выполнить одну команду BattlEye RCON.
    Требуется MAP_RCON_ENABLED=1, MAP_API_ADMIN_SECRET и заголовок X-Map-Admin-Key.
    Пароль RCON берётся только из окружения MAP_RCON_PASSWORD (не из запроса).
    """
    if not MAP_RCON_ENABLED:
        return jsonify({"error": "RCON выключен (MAP_RCON_ENABLED не задан или false)."}), 503
    if not MAP_API_ADMIN_SECRET:
        return jsonify(
            {
                "error": "Задайте MAP_API_ADMIN_SECRET и передавайте X-Map-Admin-Key — RCON без отдельного админ-ключа отключён."
            }
        ), 503
    if not secrets.compare_digest(
        request.headers.get("X-Map-Admin-Key", ""),
        MAP_API_ADMIN_SECRET,
    ):
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Admin-Key"}), 403
    if not MAP_RCON_PASSWORD:
        return jsonify({"error": "Не задан MAP_RCON_PASSWORD (пароль RCON из BEServer_x64.cfg)."}), 503
    data = request.get_json(silent=True) or {}
    cmd = rcon_service.sanitize_rcon_command(data.get("command", data.get("cmd", "")))
    if not cmd:
        return jsonify({"error": "Нужно непустое поле command (макс. 8000 символов)."}), 400
    try:
        out = rcon_service.send_command_sync(
            MAP_RCON_HOST,
            MAP_RCON_PORT,
            MAP_RCON_PASSWORD,
            cmd,
            timeout_sec=float(MAP_RCON_TIMEOUT_SEC),
        )
    except asyncio.TimeoutError:
        return jsonify({"error": "Таймаут RCON (увеличьте MAP_RCON_TIMEOUT_SEC или проверьте порт)."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"ok": True, "output": out})


@app.get("/")
def index():
    return _render_map_page("tactical")


@app.get("/eventology")
def eventology_page():
    """Отдельная страница ивентологии: те же API и БД, без вкладок тактики."""
    return _render_map_page("eventology")


@app.get("/api/map/meta")
def api_meta():
    sid = _server_id()
    rows = query_all(
        "SELECT * FROM arma_map_meta WHERE server_id = %s LIMIT 1",
        (sid,),
    )
    if not rows:
        return jsonify({"server_id": sid, "map_key": None, "mission_name": None})
    return jsonify(_serialize_row(rows[0]))


@app.get("/api/map/players")
def api_players():
    sid = _server_id()
    rows = query_all(
        "SELECT * FROM arma_map_players WHERE server_id = %s ORDER BY updated_at DESC",
        (sid,),
    )
    if _map_live_layer_suppressed(sid):
        rows = []
    else:
        rows = _filter_entity_rows(rows, kind="players")
    return jsonify({"server_id": sid, "count": len(rows), "items": [_serialize_row(r) for r in rows]})


@app.get("/api/map/vehicles")
def api_vehicles():
    sid = _server_id()
    rows = query_all(
        "SELECT * FROM arma_map_vehicles WHERE server_id = %s ORDER BY updated_at DESC",
        (sid,),
    )
    if _map_live_layer_suppressed(sid):
        rows = []
    else:
        rows = _filter_entity_rows(rows, kind="vehicles")
    return jsonify({"server_id": sid, "count": len(rows), "items": [_serialize_row(r) for r in rows]})


@app.get("/api/map/units")
def api_units():
    sid = _server_id()
    only_ai = request.args.get("only_ai", "0") == "1"
    if only_ai:
        rows = query_all(
            "SELECT * FROM arma_map_units WHERE server_id = %s AND is_player = 0 ORDER BY updated_at DESC",
            (sid,),
        )
    else:
        rows = query_all(
            "SELECT * FROM arma_map_units WHERE server_id = %s ORDER BY updated_at DESC",
            (sid,),
        )
    if _map_live_layer_suppressed(sid):
        rows = []
    else:
        rows = _filter_entity_rows(rows, kind="units")
    return jsonify({"server_id": sid, "count": len(rows), "items": [_serialize_row(r) for r in rows]})


@app.get("/api/map/markers")
def api_markers():
    sid = _server_id()
    rows = query_all(
        "SELECT * FROM arma_map_markers WHERE server_id = %s ORDER BY updated_at DESC",
        (sid,),
    )
    if _map_live_layer_suppressed(sid):
        rows = []
    return jsonify({"server_id": sid, "count": len(rows), "items": [_serialize_row(r) for r in rows]})


@app.get("/api/map/state")
def api_state():
    """Сводка для одного запроса с клиента (карта / диспетчер)."""
    sid = _server_id()
    meta_row, pulse_age = _map_meta_row_and_pulse_age(sid)
    if MAP_LIVE_META_STALE_SECONDS <= 0:
        live_off = False
    else:
        live_off = (
            meta_row is None
            or pulse_age is None
            or pulse_age > float(MAP_LIVE_META_STALE_SECONDS)
        )
    players = query_all(
        "SELECT * FROM arma_map_players WHERE server_id = %s ORDER BY updated_at DESC",
        (sid,),
    )
    vehicles = query_all(
        "SELECT * FROM arma_map_vehicles WHERE server_id = %s ORDER BY updated_at DESC",
        (sid,),
    )
    units = query_all(
        "SELECT * FROM arma_map_units WHERE server_id = %s AND is_player = 0 ORDER BY updated_at DESC",
        (sid,),
    )
    markers = query_all(
        "SELECT * FROM arma_map_markers WHERE server_id = %s ORDER BY updated_at DESC",
        (sid,),
    )
    try:
        objects = query_all(
            "SELECT * FROM arma_map_objects WHERE server_id = %s ORDER BY updated_at DESC LIMIT 8000",
            (sid,),
        )
    except Exception:
        objects = []
    if live_off:
        players = []
        vehicles = []
        units = []
        markers = []
        objects = []
    else:
        players = _filter_entity_rows(players, kind="players")
        vehicles = _filter_entity_rows(vehicles, kind="vehicles")
        units = _filter_entity_rows(units, kind="units")
        objects = _filter_object_rows(objects)
    web_markers = query_all(
        "SELECT * FROM arma_map_web_markers WHERE server_id = %s AND sync_state != 'deleted' ORDER BY id DESC",
        (sid,),
    )
    try:
        drawings = query_all(
            "SELECT * FROM arma_map_drawings WHERE server_id = %s ORDER BY id DESC LIMIT 400",
            (sid,),
        )
    except Exception:
        drawings = []
    try:
        zone_spawn_queue = query_all(
            "SELECT id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, state, error_message, created_at "
            "FROM arma_map_zone_spawn_queue WHERE server_id = %s ORDER BY id DESC LIMIT 200",
            (sid,),
        )
    except Exception:
        zone_spawn_queue = []
    try:
        admin_actions = query_all(
            "SELECT id, steam_id, action, payload, state, created_at "
            "FROM arma_map_admin_actions WHERE server_id = %s ORDER BY id DESC LIMIT 300",
            (sid,),
        )
    except Exception:
        admin_actions = []
    return jsonify(
        {
            "server_id": sid,
            "meta": _serialize_row(meta_row) if meta_row else None,
            "live": {
                "online": not live_off,
                "meta_age_sec": round(pulse_age, 2) if pulse_age is not None else None,
                "stale_threshold_sec": MAP_LIVE_META_STALE_SECONDS,
            },
            "players": {"count": len(players), "items": [_serialize_row(r) for r in players]},
            "vehicles": {"count": len(vehicles), "items": [_serialize_row(r) for r in vehicles]},
            "units_ai": {"count": len(units), "items": [_serialize_row(r) for r in units]},
            "markers": {"count": len(markers), "items": [_serialize_row(r) for r in markers]},
            "objects": {"count": len(objects), "items": [_serialize_row(r) for r in objects]},
            "web_markers": {
                "count": len(web_markers),
                "items": [_serialize_row(r) for r in web_markers],
            },
            "drawings": {"count": len(drawings), "items": [_serialize_row(r) for r in drawings]},
            "zone_spawn_queue": {
                "count": len(zone_spawn_queue),
                "items": [_serialize_row(r) for r in zone_spawn_queue],
            },
            "admin_actions": {
                "count": len(admin_actions),
                "items": [_serialize_row(r) for r in admin_actions],
            },
        }
    )


@app.get("/api/map/web-markers")
def api_web_markers_list():
    sid = _server_id()
    rows = query_all(
        "SELECT * FROM arma_map_web_markers WHERE server_id = %s AND sync_state != 'deleted' ORDER BY id DESC",
        (sid,),
    )
    return jsonify({"server_id": sid, "count": len(rows), "items": [_serialize_row(r) for r in rows]})


@app.post("/api/map/web-markers")
def api_web_markers_create():
    if not _write_authorized():
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Write-Key"}), 403
    sid = _server_id()
    data = request.get_json(silent=True) or {}
    px = _clamp_coord("pos_x", data.get("pos_x", data.get("x")))
    py = _clamp_coord("pos_y", data.get("pos_y", data.get("y")))
    pz = _clamp_coord("pos_z", data.get("pos_z", data.get("z")))
    if px is None or py is None or pz is None:
        return jsonify({"error": "Нужны числовые pos_x, pos_y, pos_z (мир Arma: x — восток/запад, y — высота, z — север/юг)"}), 400
    text_label = str(data.get("text_label", data.get("text", "")))[:256]
    marker_type = _sanitize_marker_type(str(data.get("marker_type", "")))
    color = _sanitize_color(str(data.get("color", "")))
    marker_name = f"rimweb_{secrets.token_hex(8)}"
    new_id = insert_returning_id(
        """
        INSERT INTO arma_map_web_markers
        (server_id, marker_name, text_label, marker_type, color, pos_x, pos_y, pos_z, sync_state)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
        """,
        (sid, marker_name, text_label, marker_type, color, px, py, pz),
    )
    rows = query_all(
        "SELECT * FROM arma_map_web_markers WHERE id = %s AND server_id = %s LIMIT 1",
        (new_id, sid),
    )
    return jsonify(_serialize_row(rows[0]) if rows else {"id": new_id, "marker_name": marker_name}), 201


@app.delete("/api/map/web-markers/<int:row_id>")
def api_web_markers_delete(row_id: int):
    if not _write_authorized():
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Write-Key"}), 403
    sid = _server_id()
    rows = query_all(
        "SELECT id, sync_state FROM arma_map_web_markers WHERE id = %s AND server_id = %s LIMIT 1",
        (row_id, sid),
    )
    if not rows:
        return jsonify({"error": "Не найдено"}), 404
    state = rows[0]["sync_state"]
    if state == "pending":
        n = mutate(
            "DELETE FROM arma_map_web_markers WHERE id = %s AND server_id = %s AND sync_state = 'pending'",
            (row_id, sid),
        )
        return jsonify({"ok": True, "removed": n > 0, "mode": "cancelled_pending"})
    if state == "synced":
        mutate(
            "UPDATE arma_map_web_markers SET sync_state = 'delete_pending' WHERE id = %s AND server_id = %s",
            (row_id, sid),
        )
        return jsonify({"ok": True, "mode": "queued_delete_for_game"})
    if state == "delete_pending":
        return jsonify({"ok": True, "mode": "already_queued_delete"})
    return jsonify({"error": "Некорректное состояние"}), 400


@app.post("/api/map/drawings")
def api_drawings_create():
    if not _write_authorized():
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Write-Key"}), 403
    sid = _server_id()
    data = request.get_json(silent=True) or {}
    shape = _sanitize_shape_type(str(data.get("shape_type", "")))
    team = _sanitize_team_color(str(data.get("team_color", "")))
    variant = _sanitize_map_variant(str(data.get("map_variant", "")))
    label = str(data.get("label", ""))[:256]
    path = _validate_latlng_path(data.get("latlng_path"))
    if path is None:
        return jsonify({"error": "Нужен latlng_path: массив [[lat,lng], ...] минимум 2 точки"}), 400
    if shape == "polygon" and len(path) < 3:
        return jsonify({"error": "Полигон: минимум 3 точки"}), 400
    arma_path = data.get("arma_path")
    arma_clean: list[dict[str, float]] | None = None
    if isinstance(arma_path, list) and len(arma_path) == len(path):
        arma_clean = []
        for pt in arma_path:
            if not isinstance(pt, dict):
                arma_clean = None
                break
            px = _clamp_coord("ax", pt.get("pos_x", pt.get("x")))
            py = _clamp_coord("ay", pt.get("pos_y", pt.get("y")))
            pz = _clamp_coord("az", pt.get("pos_z", pt.get("z")))
            if px is None or py is None or pz is None:
                arma_clean = None
                break
            arma_clean.append({"pos_x": px, "pos_y": py, "pos_z": pz})
    geom = json.dumps({"path": path, "arma": arma_clean}, ensure_ascii=False)
    pts = _downsample_points(_drawing_arma_points_from_geom({"path": path, "arma": arma_clean}), 96)
    arma_pts_pipe = _triplets_to_pipe(pts) if len(pts) >= 2 else ""
    new_id = insert_returning_id(
        """
        INSERT INTO arma_map_drawings (server_id, map_variant, shape_type, team_color, geom_json, label, arma_pts_pipe)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (sid, variant, shape, team, geom, label or None, arma_pts_pipe or None),
    )
    rows = query_all(
        "SELECT * FROM arma_map_drawings WHERE id = %s AND server_id = %s LIMIT 1",
        (new_id, sid),
    )
    return jsonify(_serialize_row(rows[0]) if rows else {"id": new_id}), 201


@app.delete("/api/map/drawings/<int:row_id>")
def api_drawings_delete(row_id: int):
    if not _write_authorized():
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Write-Key"}), 403
    sid = _server_id()
    n = mutate("DELETE FROM arma_map_drawings WHERE id = %s AND server_id = %s", (row_id, sid))
    return jsonify({"ok": True, "removed": n > 0})


@app.get("/api/map/drawings-cache.sqf")
def api_drawings_cache_sqf():
    """Кэш рисунков в виде SQF-массива для call compile в миссии (см. mission_map_drawings_consumer_example.sqf)."""
    sid = _server_id()
    raw_var = (request.args.get("map_variant") or "tactical").strip().lower()
    if raw_var not in ("tactical", "eventology", "all"):
        raw_var = "tactical"
    q = (
        "SELECT id, shape_type, team_color, geom_json, map_variant, "
        "IFNULL(arma_pts_pipe,'') AS arma_pts_pipe FROM arma_map_drawings WHERE server_id = %s"
    )
    params: list[object] = [sid]
    if raw_var != "all":
        q += " AND map_variant = %s"
        params.append(raw_var)
    q += " ORDER BY id ASC LIMIT 220"
    try:
        rows = query_all(q, tuple(params))
    except Exception:
        rows = []
    lines: list[str] = []
    for r in rows:
        pipe = str(r.get("arma_pts_pipe") or "").strip()
        if pipe:
            pts = _pipe_to_triplets(pipe)
        else:
            g = _drawing_geom_to_dict(r.get("geom_json"))
            pts = _drawing_arma_points_from_geom(g)
        if len(pts) < 2:
            continue
        pts = _downsample_points(pts, 96)
        sh = _sanitize_shape_type(str(r.get("shape_type") or "polyline"))
        tm = _sanitize_team_color(str(r.get("team_color") or "blue"))
        sq = _triplets_to_sqf_array(pts)
        rid = int(r["id"])
        lines.append(f"  [ {rid}, {_sqf_escape_str(sh)}, {_sqf_escape_str(tm)}, {sq} ]")
    body = (
        "// rim map_api: кэш зон с веб-карты для миссии Arma 3\n"
        "// Скачать на сервер (пример): curl \"http://127.0.0.1:5050/api/map/drawings-cache.sqf?server_id="
        + str(sid)
        + "&map_variant=tactical\" -o mpmissions\\Rim_Conflict_base.Kapaulio\\scripts\\rim_map_drawings_cache.sqf\n"
        "[\n" + ",\n".join(lines) + "\n]\n"
    )
    return Response(body, mimetype="text/plain; charset=utf-8")


@app.post("/api/map/objects/delete")
def api_objects_delete_row():
    """Удалить строку пропа из БД (ластик на карте). Миссия при следующем тике перестанет видеть объект."""
    if not _write_authorized():
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Write-Key"}), 403
    sid = _server_id()
    data = request.get_json(silent=True) or {}
    net_id = _sanitize_net_id(str(data.get("net_id", "")))
    if not net_id:
        return jsonify({"error": "Нужен net_id"}), 400
    n = mutate(
        "DELETE FROM arma_map_objects WHERE server_id = %s AND net_id = %s",
        (sid, net_id),
    )
    return jsonify({"ok": True, "removed": n > 0})


@app.post("/api/map/orders")
def api_map_orders_create():
    """Очередь приказов юниту/технике (движение) — обработка в миссии по arma_map_orders."""
    if not _write_authorized():
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Write-Key"}), 403
    sid = _server_id()
    data = request.get_json(silent=True) or {}
    kind = _sanitize_order_kind(str(data.get("target_kind", "")))
    net_id = _sanitize_net_id(str(data.get("net_id", "")))
    otype = _sanitize_order_type(str(data.get("order_type", "")))
    if not kind or not net_id:
        return jsonify({"error": "Нужны target_kind (veh|unit) и net_id"}), 400
    px = _clamp_coord("pos_x", data.get("pos_x", data.get("x")))
    py = _clamp_coord("pos_y", data.get("pos_y", data.get("y")))
    pz = _clamp_coord("pos_z", data.get("pos_z", data.get("z")))
    if px is None or py is None or pz is None:
        return jsonify({"error": "Нужны pos_x, pos_y, pos_z цели движения"}), 400
    new_id = insert_returning_id(
        """
        INSERT INTO arma_map_orders (server_id, target_kind, net_id, order_type, pos_x, pos_y, pos_z, state)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
        """,
        (sid, kind, net_id, otype, px, py, pz),
    )
    return jsonify({"ok": True, "id": new_id, "target_kind": kind, "net_id": net_id}), 201


@app.get("/api/map/zones/spawn-queue")
def api_map_zone_spawn_queue_list():
    """Очередь спавна зон (веб → миссия). Для отладки и панели."""
    sid = _server_id()
    rows = query_all(
        "SELECT id, server_id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, trigger_radius_a, "
        "trigger_radius_b, state, error_message, created_at "
        "FROM arma_map_zone_spawn_queue WHERE server_id = %s ORDER BY id DESC LIMIT 200",
        (sid,),
    )
    return jsonify(
        {"server_id": sid, "count": len(rows), "items": [_serialize_row(r) for r in rows]}
    )


@app.delete("/api/map/zones/spawn-queue/<int:row_id>")
def api_map_zone_spawn_queue_delete(row_id: int):
    """
    Удаление заявки из очереди активностей.
    Удаление записи активности из таблицы.
    pending/failed/done можно удалить как запись (без удаления уже созданной зоны).
    """
    sid = _server_id()
    rows = query_all(
        "SELECT id, state, pos_x, pos_z, zone_uid, template_zone_id FROM arma_map_zone_spawn_queue "
        "WHERE id = %s AND server_id = %s LIMIT 1",
        (row_id, sid),
    )
    if not rows:
        return jsonify({"error": "Не найдено"}), 404
    n = mutate(
        "DELETE FROM arma_map_zone_spawn_queue WHERE id = %s AND server_id = %s",
        (row_id, sid),
    )
    try:
        zu = str(rows[0].get("zone_uid") or "").strip()
        if zu:
            _discord_bridge_retract_zone(zu)
    except Exception:
        pass
    try:
        _delete_recon_drawings_near(
            server_id=sid,
            pos_x=float(rows[0].get("pos_x") or 0.0),
            pos_z=float(rows[0].get("pos_z") or 0.0),
            labels={"Разведка Аванпост"},
            radius_m=360.0,
        )
    except Exception:
        pass
    return jsonify({"ok": True, "removed": n > 0})


@app.delete("/api/map/admin-actions/<int:row_id>")
def api_map_admin_actions_delete(row_id: int):
    """Удаление записи админ-действия из таблицы индекса активностей."""
    sid = _server_id()
    rows = query_all(
        "SELECT id, action, payload FROM arma_map_admin_actions WHERE id = %s AND server_id = %s LIMIT 1",
        (row_id, sid),
    )
    if not rows:
        return jsonify({"error": "Не найдено"}), 404
    row = rows[0]
    n = mutate(
        "DELETE FROM arma_map_admin_actions WHERE id = %s AND server_id = %s",
        (row_id, sid),
    )
    try:
        act = str(row.get("action") or "")
        payload = str(row.get("payload") or "")
        if act in ("spawn_convoy", "spawn_patrol"):
            rzu = _extract_pipe_option(payload, "recon_uid")
            if rzu:
                try:
                    _discord_bridge_retract_zone(rzu)
                except Exception:
                    pass
            pos = _admin_payload_to_pos(payload)
            if pos:
                _delete_recon_drawings_near(
                    server_id=sid,
                    pos_x=float(pos[0]),
                    pos_z=float(pos[2]),
                    labels={"Разведка Колонна", "Разведка Патруль"},
                    radius_m=500.0,
                )
    except Exception:
        pass
    return jsonify({"ok": True, "removed": True})


@app.patch("/api/map/admin-actions/<int:row_id>")
def api_map_admin_actions_patch(row_id: int):
    """Только pending: смена класса техники / НПС патруля для колонны и патруля."""
    if not _admin_authorized():
        return jsonify(
            {
                "error": "Нужен X-Map-Admin-Key или X-Map-Write-Key (см. MAP_API_ADMIN_SECRET / MAP_API_WRITE_SECRET в map_api)"
            }
        ), 403
    sid = _server_id()
    data = request.get_json(silent=True) or {}
    rows = query_all(
        "SELECT id, action, payload, state FROM arma_map_admin_actions WHERE id = %s AND server_id = %s LIMIT 1",
        (row_id, sid),
    )
    if not rows:
        return jsonify({"error": "Не найдено"}), 404
    row = rows[0]
    if str(row.get("state") or "") != "pending":
        return jsonify({"error": "Можно править только действия в статусе pending"}), 409
    act = str(row.get("action") or "").lower()
    if act not in ("spawn_convoy", "spawn_patrol"):
        return jsonify({"error": "Только spawn_convoy или spawn_patrol"}), 400
    payload_old = str(row.get("payload") or "")
    vc = data.get("vehicle_class", data.get("veh_class"))
    nc = data.get("npc_class")
    new_payload = _patch_spawn_route_payload(
        payload_old,
        vehicle_class=str(vc).strip() if vc is not None else None,
        npc_class=str(nc).strip() if nc is not None else None,
    )
    if not new_payload:
        return jsonify({"error": "Некорректный payload маршрута"}), 400
    mutate(
        "UPDATE arma_map_admin_actions SET payload=%s WHERE id=%s AND server_id=%s AND state='pending'",
        (new_payload, row_id, sid),
    )
    return jsonify({"ok": True, "id": row_id, "payload": new_payload})


@app.post("/api/map/zones/spawn-request")
def api_map_zone_spawn_request():
    """
    Постановка аванпоста в очередь: координаты мира Arma + шаблон из zone_config.sqf
    (template_zone_id, например avanpost_1). Уникальный идентификатор — zone_uid (можно передать
    или будет сгенерирован rim_ap_<hex>). На стороне миссии template_zone_id используется как zoneID,
    а zone_uid хранится отдельно для уникальности и трассировки.
    """
    if not _write_authorized():
        return jsonify({"error": "Неверный или отсутствует заголовок X-Map-Write-Key"}), 403
    sid = _server_id()
    data = request.get_json(silent=True) or {}
    tpl = _sanitize_template_zone_id(str(data.get("template_zone_id", "")))
    if not tpl:
        return jsonify(
            {"error": "Нужен template_zone_id (буквы, цифры, _), совпадающий со строкой в zone_config.sqf"}
        ), 400
    raw_uid = data.get("zone_uid", data.get("zone_id"))
    if raw_uid is not None and str(raw_uid).strip() != "":
        zone_uid = _sanitize_zone_uid(str(raw_uid))
        if not zone_uid:
            return jsonify(
                {
                    "error": "zone_uid: 4–64 символа, начало с буквы, далее буквы/цифры/_/-",
                }
            ), 400
        dup = query_all(
            "SELECT id FROM arma_map_zone_spawn_queue WHERE server_id = %s AND zone_uid = %s LIMIT 1",
            (sid, zone_uid),
        )
        if dup:
            return jsonify({"error": "Такой zone_uid уже есть для этого server_id", "zone_uid": zone_uid}), 409
    else:
        zone_uid = _generate_zone_uid()
    px = _clamp_coord("pos_x", data.get("pos_x", data.get("x")))
    py = _clamp_coord("pos_y", data.get("pos_y", data.get("y")))
    pz = _clamp_coord("pos_z", data.get("pos_z", data.get("z")))
    
    # Логирование для отладки координат
    app.logger.info(f"[SPAWN_REQUEST] template={tpl}, coords: X={px}, Y={py}, Z={pz}")
    
    if px is None or py is None or pz is None:
        return jsonify(
            {"error": "Нужны pos_x, pos_y, pos_z (мир Arma: x, высота y, z)"}
        ), 400
    ra = _clamp_trigger_radius(data.get("trigger_radius_a"), 50.0)
    rb = _clamp_trigger_radius(data.get("trigger_radius_b"), 50.0)
    if ra is None or rb is None:
        return jsonify(
            {"error": "trigger_radius_a / trigger_radius_b: числа в (0, 2500], по умолчанию 50"}
        ), 400
    new_id = insert_returning_id(
        """
        INSERT INTO arma_map_zone_spawn_queue
        (server_id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, trigger_radius_a, trigger_radius_b, state)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
        """,
        (sid, zone_uid, tpl, px, py, pz, ra, rb),
    )
    _discord_bridge_publish_outpost(
        server_id=sid,
        zone_uid=zone_uid,
        template_zone_id=tpl,
        pos_x=px,
        pos_y=py,
        pos_z=pz,
        radius_a=ra,
        radius_b=rb,
    )
    verts = _template_vertices(px, pz, max(ra, rb))
    _create_recon_drawing(
        server_id=sid,
        shape_type="polygon",
        team_color="red",
        label="Разведка Аванпост",
        arma_points=[
            [verts["NW"][0], py, verts["NW"][1]],
            [verts["NE"][0], py, verts["NE"][1]],
            [verts["SE"][0], py, verts["SE"][1]],
            [verts["SW"][0], py, verts["SW"][1]],
        ],
    )
    return jsonify(
        {
            "ok": True,
            "id": new_id,
            "zone_uid": zone_uid,
            "template_zone_id": tpl,
            "pos_x": px,
            "pos_y": py,
            "pos_z": pz,
            "trigger_radius_a": ra,
            "trigger_radius_b": rb,
        }
    ), 201


@app.post("/api/map/admin/action")
def api_admin_action():
    if not _admin_authorized():
        return jsonify(
            {
                "error": "Нужен X-Map-Admin-Key или X-Map-Write-Key (см. MAP_API_ADMIN_SECRET / MAP_API_WRITE_SECRET в map_api)"
            }
        ), 403
    sid = _server_id()
    data = request.get_json(silent=True) or {}
    steam_raw = str(data.get("steam_id", ""))
    steam = _sanitize_steam_id(steam_raw)
    act = _sanitize_admin_action(str(data.get("action", "")))
    if not act:
        return jsonify(
            {"error": "Нужен action (kick|ban|message|lightning|grant_zeus|teleport|slay|artillery|delete_zone|assault_zone|start_quest|spawn_convoy|spawn_patrol)"}
        ), 400
    if act not in ("artillery", "delete_zone", "assault_zone", "start_quest", "spawn_convoy", "spawn_patrol") and not steam:
        return jsonify({"error": "Нужен steam_id для выбранного action"}), 400
    if act in ("artillery", "delete_zone", "assault_zone", "start_quest", "spawn_convoy", "spawn_patrol") and not steam:
        steam = "SERVER"
    payload = _admin_action_payload(act, data)
    if act in ("teleport", "artillery", "delete_zone", "assault_zone", "spawn_convoy", "spawn_patrol") and not payload:
        return jsonify({"error": "Нужны pos_x, pos_y, pos_z"}), 400
    if act == "start_quest" and not payload:
        return jsonify({"error": "Нужен quest_script (*.sqf)"}), 400
    new_id = insert_returning_id(
        """
        INSERT INTO arma_map_admin_actions (server_id, steam_id, action, payload, state)
        VALUES (%s, %s, %s, %s, 'pending')
        """,
        (sid, steam, act, payload or None),
    )
    if act in ("spawn_convoy", "spawn_patrol") and not data.get("route_append"):
        route = data.get("route_points", [])
        pts_clean: list[dict[str, float]] = []
        if isinstance(route, list):
            for pt in route[:32]:
                if not isinstance(pt, dict):
                    continue
                rx = _clamp_coord("route_x", pt.get("pos_x", pt.get("x")))
                ry = _clamp_coord("route_y", pt.get("pos_y", pt.get("y", 0)))
                rz = _clamp_coord("route_z", pt.get("pos_z", pt.get("z")))
                if rx is None or ry is None or rz is None:
                    continue
                pts_clean.append({"pos_x": rx, "pos_y": ry, "pos_z": rz})
        if len(pts_clean) >= 2:
            _create_recon_drawing(
                server_id=sid,
                shape_type="polyline",
                team_color="red",
                label="Разведка Колонна" if act == "spawn_convoy" else "Разведка Патруль",
                arma_points=[[p["pos_x"], p["pos_y"], p["pos_z"]] for p in pts_clean],
            )
            route_zuid = _extract_pipe_option(payload or "", "recon_uid")
            try:
                vc_raw = int(data.get("veh_count", data.get("vehicle_count", 3)))
            except (TypeError, ValueError):
                vc_raw = 3
            vc_raw = max(1, min(20, vc_raw))
            _discord_bridge_publish_route(
                server_id=sid,
                action=act,
                points=pts_clean,
                enemy_estimate=max(6, int(data.get("veh_count", 3)) * 6),
                zone_uid=route_zuid,
                veh_count=vc_raw if act == "spawn_convoy" else None,
            )
    resp: dict[str, object] = {"ok": True, "id": new_id, "action": act, "steam_id": steam}
    if act in ("spawn_convoy", "spawn_patrol") and payload:
        ru = _extract_pipe_option(payload, "recon_uid")
        if ru:
            resp["recon_uid"] = ru
    return jsonify(resp), 201


@app.post("/api/map/service/restart")
def api_map_service_restart():
    """Перезапуск процесса map_api (Windows: taskkill текущего PID + run_map_api.cmd). Нужен Write- или Admin-ключ."""
    if not _service_restart_configured():
        return jsonify(
            {
                "error": "Перезапуск недоступен: задайте MAP_API_WRITE_SECRET или MAP_API_ADMIN_SECRET в окружении."
            }
        ), 503
    if not _service_restart_authorized():
        return jsonify(
            {
                "error": "Нужен заголовок X-Map-Write-Key или X-Map-Admin-Key (как на странице карты / RCON)."
            }
        ), 403
    ok, err = _trigger_service_restart()
    if not ok:
        return jsonify({"error": err or "не удалось запустить перезапуск"}), 500
    return jsonify(
        {
            "ok": True,
            "message": "Перезапуск запущен: через ~3 с поднимется новый процесс. Обновите страницу.",
        }
    )


@app.after_request
def _map_api_disable_http_cache(response: object) -> object:
    """Браузер/прокси не должны кешировать live JSON — иначе «призраки» после выключения сервера."""
    try:
        p = getattr(request, "path", "") or ""
    except RuntimeError:
        return response
    if p.startswith("/api/map/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.get("/health")
def health():
    """Проверка БД и (без секретов) готовности RCON — удобно curl-ом, когда карта в браузере не открывается."""
    out: dict = {
        "status": "ok",
        "db": False,
        "service_restart": {
            "configured": _service_restart_configured(),
            "port": int(os.environ.get("MAP_API_PORT", "5050")),
        },
        "rcon": {
            "enabled": bool(MAP_RCON_ENABLED),
            "host": MAP_RCON_HOST,
            "port": MAP_RCON_PORT,
            "password_configured": bool(MAP_RCON_PASSWORD),
            "admin_secret_configured": bool(MAP_API_ADMIN_SECRET),
            "berconpy_installed": rcon_service.berconpy_installed(),
        },
    }
    try:
        query_all("SELECT 1 AS ok")
        out["db"] = True
    except Exception as e:
        out["status"] = "degraded"
        out["db"] = False
        out["error"] = str(e)
        return jsonify(out), 503
    return jsonify(out)


def main():
    host = os.environ.get("MAP_API_HOST", "0.0.0.0")
    port = int(os.environ.get("MAP_API_PORT", "5050"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug, use_reloader=debug)


if __name__ == "__main__":
    main()
