"""
Фильтрация строк live-карты перед отдачей в /api/map/state:
- «призраки» техники/AI после удаления в мире (строка в БД не обновляется);
- пропы/модули за пределами острова (часто Zeus/ACE композиции «под картой»).
Логика xz совпадает с templates/map.html (xzFromRow / xzFromRowObject).
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from map_api.config import MAP_HEADLESS_HIDE_NAME_REGEX

_hpat = (MAP_HEADLESS_HIDE_NAME_REGEX or "").strip() or r"^(hc\d*|headless.*)$"
_HEADLESS_NAME_RE = re.compile(_hpat, re.I)


def xz_from_row(row: dict[str, Any], world: int) -> tuple[float, float]:
    x = float(row.get("pos_x") or 0)
    z = float(row.get("pos_z") or 0)
    y = float(row.get("pos_y") or 0)
    if abs(z) < 0.5 and y > 200 and y < world * 1.1 and x > 0:
        return x, y
    return x, z


def xz_from_row_object(row: dict[str, Any], world: int, swap_plane_axes: bool) -> tuple[float, float]:
    x0 = float(row.get("pos_x") or 0)
    y0 = float(row.get("pos_y") or 0)
    z0 = float(row.get("pos_z") or 0)
    max_c = world * 1.08
    if swap_plane_axes:
        return y0, x0
    if z0 > 120 and z0 < max_c and abs(y0) < 920:
        return x0, z0
    if y0 > 120 and y0 < max_c and abs(z0) < 920:
        return x0, y0
    if abs(z0) < 0.65 and y0 > 120 and y0 < max_c and x0 > -400 and x0 < max_c:
        return x0, y0
    if abs(z0) < 0.65 and x0 > 120 and y0 > 120 and x0 < max_c and y0 < max_c:
        return y0, x0
    return xz_from_row(row, world)


def row_updated_age_seconds(row: dict[str, Any]) -> float | None:
    u = row.get("updated_at")
    if u is None:
        return None
    if isinstance(u, datetime):
        return (datetime.now() - u).total_seconds()
    return None


def row_is_stale(row: dict[str, Any], max_age_sec: int) -> bool:
    if max_age_sec <= 0:
        return False
    age = row_updated_age_seconds(row)
    if age is None:
        return False
    return age > float(max_age_sec)


def map_live_offline_by_meta(meta_row: dict[str, Any] | None, max_age_sec: int) -> bool:
    """
    Сервер Arma считается выключенным, если нет строки arma_map_meta
    или поле updated_at старше max_age_sec (пульс пишет fn_mapLiveTick).
    max_age_sec <= 0 — проверка отключена (как раньше: всегда показывать БД).
    """
    if max_age_sec <= 0:
        return False
    if not meta_row:
        return True
    age = row_updated_age_seconds(meta_row)
    if age is None:
        return True
    return age > float(max_age_sec)


def row_outside_world_bounds(
    row: dict[str, Any],
    world: int,
    swap_plane_axes: bool,
    margin: float,
) -> bool:
    x, z = xz_from_row_object(row, world, swap_plane_axes)
    return x < -margin or x > world + margin or z < -margin or z > world + margin


def object_classname_hidden(classname: str, needles: tuple[str, ...]) -> bool:
    c = (classname or "").lower()
    return any(n in c for n in needles if n)


def parse_hide_classname_needles(raw: str) -> tuple[str, ...]:
    parts = [p.strip().lower() for p in (raw or "").split(",") if p.strip()]
    return tuple(parts)


def row_is_headless_map_name(row: dict[str, Any]) -> bool:
    """Headless client в списке игроков/юнитов (имя HC, HC2008, Headless…)."""
    nm = str(row.get("name") or "").strip()
    if not nm:
        return False
    if _HEADLESS_NAME_RE.match(nm):
        return True
    return False
