"""
HTTP-бридж разведки (map_api) → Discord + кнопка «Опубликовать приказ» (как updatebot).
Поле token = MAP_DISCORD_BRIDGE_TOKEN. Для кнопок нужен тот же бот с запущенным Sharding (второй поток discord.py).
"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path

import discord
import requests
from discord import InteractionType
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

_ROOT = Path(__file__).resolve().parent
load_dotenv(_ROOT / ".env", override=True)

if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import io as _io

from recon_sketch import render_intel_sketch, render_route_sketch

DISCORD_TOKEN = (os.environ.get("DISCORD_TOKEN") or "").strip()
CHANNEL_ID = int(os.environ.get("RECON_CHANNEL_ID") or "0")
# Канал приказов по кнопке «Опубликовать приказ» (можно переопределить в .env).
ORDER_CHANNEL_ID = int(
    os.environ.get("ORDER_CHANNEL_ID") or "1473748091210563771"
)
BRIDGE_SECRET = (os.environ.get("MAP_DISCORD_BRIDGE_TOKEN") or "").strip()
HTTP_HOST = os.environ.get("RECON_HTTP_HOST", "127.0.0.1")
HTTP_PORT = int(os.environ.get("RECON_HTTP_PORT", "8765"))
RECON_PANEL_SECRET = (os.environ.get("RECON_PANEL_SECRET") or "").strip()

DB_PATH = Path(__file__).resolve().parent / "recon_messages.sqlite3"
_PROCESS_STARTED_MONO = time.monotonic()


def _recon_repo_root() -> Path:
    raw = (os.environ.get("RECON_REPO_ROOT") or "").strip()
    if raw:
        return Path(raw).resolve()
    return _ROOT.resolve().parent


def _restart_bundle_ok() -> bool:
    root = _recon_repo_root()
    return (root / "run_recon_bot.cmd").is_file() and (_ROOT / "restart_worker.py").is_file()


def _panel_authorized() -> bool:
    if not RECON_PANEL_SECRET:
        return False
    got = request.headers.get("X-Recon-Panel-Key", "")
    return secrets.compare_digest(got, RECON_PANEL_SECRET)


def _arma_rpt_tail(max_lines: int = 48, max_chars: int = 12000) -> str:
    """Хвост .rpt для панели: RECON_ARMA_RPT_PATH или последний *.rpt в RECON_ARMA_RPT_DIR / LOCALAPPDATA."""
    path_raw = (os.environ.get("RECON_ARMA_RPT_PATH") or "").strip()
    p: Path | None = None
    if path_raw:
        cand = Path(path_raw).expanduser()
        if cand.is_file():
            p = cand
    if p is None:
        dir_raw = (os.environ.get("RECON_ARMA_RPT_DIR") or "").strip()
        globs: list[Path] = []
        if dir_raw:
            d = Path(dir_raw).expanduser()
            if d.is_dir():
                globs = sorted(d.glob("*.rpt"), key=lambda x: x.stat().st_mtime, reverse=True)
        if not globs:
            lad = os.environ.get("LOCALAPPDATA", "")
            if lad:
                d2 = Path(lad) / "Arma 3"
                if d2.is_dir():
                    globs = sorted(
                        [
                            x
                            for x in d2.glob("arma3server_x64*.rpt")
                            if "profiling" not in x.name.lower()
                        ],
                        key=lambda x: x.stat().st_mtime,
                        reverse=True,
                    )
                    if not globs:
                        globs = sorted(
                            [
                                x
                                for x in d2.glob("arma3server*.rpt")
                                if "profiling" not in x.name.lower()
                            ],
                            key=lambda x: x.stat().st_mtime,
                            reverse=True,
                        )
                    if not globs:
                        globs = sorted(d2.glob("*.rpt"), key=lambda x: x.stat().st_mtime, reverse=True)
        # Типичный dedicated Rim: -profiles=C:\\a3server\\profiles (не LOCALAPPDATA)
        if not globs:
            prof = Path(r"C:\a3server\profiles")
            if prof.is_dir():
                globs = sorted(prof.glob("arma3server*.rpt"), key=lambda x: x.stat().st_mtime, reverse=True)
        if globs:
            p = globs[0]
    if p is None or not p.is_file():
        return ""
    try:
        raw = p.read_bytes()
        if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
            text = raw.decode("utf-16", errors="replace")
        else:
            text = raw.decode("utf-8", errors="replace")
    except OSError:
        return ""
    lines = text.splitlines()
    tail = lines[-max_lines:] if len(lines) > max_lines else lines
    out = "\n".join(tail)
    if len(out) > max_chars:
        out = out[-max_chars:]
    return f"… ({p.name})\n{out}"


def _trigger_service_restart() -> tuple[bool, str]:
    root = _recon_repo_root()
    if not (root / "run_recon_bot.cmd").is_file():
        return False, "Нет run_recon_bot.cmd в корне репозитория"
    worker = _ROOT / "restart_worker.py"
    if not worker.is_file():
        return False, "Нет recon_bot/restart_worker.py"
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


# Роли через запятую: 123,456
def _role_ids_from_env(key: str) -> list[str]:
    raw = (os.environ.get(key) or "").strip()
    out: list[str] = []
    for part in raw.split(","):
        s = part.strip()
        if s.isdigit():
            out.append(s)
    return out


RECON_PING_ROLE_IDS = _role_ids_from_env("RECON_PING_ROLE_IDS")
ORDER_PING_ROLE_IDS = _role_ids_from_env("ORDER_PING_ROLE_IDS")

app = Flask(__name__, template_folder=str(_ROOT / "templates"))

_discord_client: discord.Client | None = None


def _role_mentions(role_ids: list[str]) -> str:
    uniq = list(dict.fromkeys(role_ids))
    return " ".join(f"<@&{rid}>" for rid in uniq if rid)


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    cx = sqlite3.connect(DB_PATH, check_same_thread=False)
    cx.execute(
        "CREATE TABLE IF NOT EXISTS recon_msg (zone_uid TEXT PRIMARY KEY, message_id TEXT NOT NULL)"
    )
    cx.execute(
        """CREATE TABLE IF NOT EXISTS recon_event (
            event_id TEXT PRIMARY KEY,
            zone_uid TEXT NOT NULL,
            payload_json TEXT NOT NULL
        )"""
    )
    cx.execute(
        "CREATE TABLE IF NOT EXISTS recon_meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0)"
    )
    cx.execute("INSERT OR IGNORE INTO recon_meta (k,v) VALUES ('order_seq',0)")
    return cx


def _next_order_seq() -> int:
    with _db() as cx:
        cx.execute("UPDATE recon_meta SET v=v+1 WHERE k='order_seq'")
        row = cx.execute("SELECT v FROM recon_meta WHERE k='order_seq'").fetchone()
    return int(row[0]) if row else 1


def _auth(data: dict) -> bool:
    if not BRIDGE_SECRET:
        return False
    return str(data.get("token") or "") == BRIDGE_SECRET


def _color_for_payload(data: dict) -> int:
    et = str(data.get("event_type") or "").lower()
    if et == "convoy":
        return 0xDC2626
    if et == "patrol":
        return 0x2563EB
    if et == "outpost":
        return 0xEA580C
    return 0xF59E0B


def _embed_route_intel(data: dict) -> dict:
    et = str(data.get("event_type") or "").lower()
    tpl_name = str(
        data.get("template_name") or ("Колонна" if et == "convoy" else "Патруль")
    )
    server_id = data.get("server_id", "")
    zone_uid = str(data.get("zone_uid") or "")
    square = str(data.get("square") or "")
    px = data.get("pos_x")
    py = data.get("pos_y")
    pz = data.get("pos_z")
    try:
        enemies = int(data.get("enemy_estimate") or 1)
    except (TypeError, ValueError):
        enemies = 1
    try:
        r = float(data.get("report_radius_m") or 500)
    except (TypeError, ValueError):
        r = 500.0
    try:
        veh = int(data.get("veh_count") or 0)
    except (TypeError, ValueError):
        veh = 0
    try:
        npts = int(data.get("n_route_points") or 2)
    except (TypeError, ValueError):
        npts = 2

    if et == "convoy":
        hypo = "вероятная **колонна бронетехники**"
        role_line = (
            f"Ориентир по технике: **до {veh}** ед. в колонне (разведоценка)."
            if veh > 0
            else "Состав колонны уточняется."
        )
    else:
        hypo = "возможный **патруль** или передовая разведгруппа"
        role_line = "Характер перемещения — по цепочке вейпоинтов; связь с базой неизвестна."

    lines = [
        "## Разведданные",
        "",
        f"**Район:** квадрат **{square}** · сервер `{server_id}` · метка `{zone_uid}`",
        "",
        f"В **радиусе порядка {r:.0f} м** от точки **X ≈ {px}**, **Z ≈ {pz}** (**Y = {py}**) "
        "обнаружено **скопление сил противника**.",
        "",
        f"**Гипотеза:** {hypo}.",
        f"**Численность (оценка):** ~**{enemies}** условных бойцов.",
        f"**Маршрут:** **{npts}** точек — **старт развёртывания** и вейпоинты **A, B, …**.",
        "",
        role_line,
    ]
    mpos = data.get("marker_positions")
    if isinstance(mpos, list) and mpos:
        pts = " · ".join(
            f"**{m.get('name', '?')}** ({m.get('x')}, {m.get('z')})" for m in mpos[:10]
        )
        lines.extend(["", "**Точки (X, Z):**", pts])

    desc = "\n".join(lines)[:4000]
    return {
        "title": f"Разведданные · {tpl_name}"[:256],
        "description": desc,
        "footer": {"text": "Тактическая карта · проверить разведкой/NVD"},
        "color": _color_for_payload(data),
    }


def _embed_from_payload(data: dict) -> dict:
    et = str(data.get("event_type") or "").lower()
    if et in ("convoy", "patrol"):
        return _embed_route_intel(data)

    tpl_name = str(data.get("template_name") or "Разведка")
    server_id = data.get("server_id", "")
    zone_uid = str(data.get("zone_uid") or "")
    tpl_id = str(data.get("template_zone_id") or "")
    square = str(data.get("square") or "")
    px = data.get("pos_x")
    py = data.get("pos_y")
    pz = data.get("pos_z")
    enemies = data.get("enemy_estimate", "")
    lines = [
        "## Разведданные",
        "",
        f"**{tpl_name}** (`{tpl_id}`)" if tpl_id else f"**{tpl_name}**",
        f"Сервер: `{server_id}` · квадрат **{square}** · UID `{zone_uid}`",
        f"Центр: **X = {px}** · **Z = {pz}** · высота **Y = {py}**",
    ]
    verts = data.get("vertices")
    if isinstance(verts, dict):
        def _fmt_xz(v):
            if isinstance(v, dict):
                return f"{v.get('x')}, {v.get('z')}"
            return str(v)

        if "nw" in verts:
            lines.append(
                "Углы (X,Z): NW `{nw}` NE `{ne}` SE `{se}` SW `{sw}`".format(
                    nw=_fmt_xz(verts.get("nw")),
                    ne=_fmt_xz(verts.get("ne")),
                    se=_fmt_xz(verts.get("se")),
                    sw=_fmt_xz(verts.get("sw")),
                )
            )
    if enemies != "":
        lines.append(f"Оценка численности: **~{enemies}**")
    desc = "\n".join(lines)[:4000]
    return {
        "title": f"Разведданные · {tpl_name}"[:256],
        "description": desc,
        "color": _color_for_payload(data),
    }


def _store_order_payload(*, event_id: str, zone_uid: str, data: dict) -> None:
    """Данные для текста приказа по кнопке (полный контекст разведки)."""
    try:
        r_rad = float(data.get("report_radius_m") or 0)
    except (TypeError, ValueError):
        r_rad = 0.0
    try:
        n_route = int(data.get("n_route_points") or 0)
    except (TypeError, ValueError):
        n_route = 0
    mpos = data.get("marker_positions")
    if not isinstance(mpos, list):
        mpos = []
    verts = data.get("vertices")
    if not isinstance(verts, dict):
        verts = None
    try:
        mws = float(data.get("map_world_size") or 20500.0)
    except (TypeError, ValueError):
        mws = 20500.0
    payload = {
        "eventId": event_id,
        "zoneUid": zone_uid,
        "eventType": str(data.get("event_type") or "").lower(),
        "templateName": str(data.get("template_name") or data.get("template_zone_id") or "Аванпост"),
        "templateZoneId": str(data.get("template_zone_id") or ""),
        "square": str(data.get("square") or "??-??"),
        "enemyEstimate": int(data.get("enemy_estimate") or 0),
        "reportRadiusM": r_rad,
        "nRoutePoints": n_route,
        "serverId": data.get("server_id"),
        "pos": {
            "x": float(data.get("pos_x") or 0),
            "y": float(data.get("pos_y") or 0),
            "z": float(data.get("pos_z") or 0),
        },
        "markerPositions": mpos[:16],
        "vertices": verts,
        "map_world_size": mws,
        "map_overlay_url": data.get("map_overlay_url"),
    }
    with _db() as cx:
        cx.execute(
            "INSERT OR REPLACE INTO recon_event (event_id, zone_uid, payload_json) VALUES (?,?,?)",
            (event_id, zone_uid, json.dumps(payload, ensure_ascii=False)),
        )


def _sketch_dict_from_payload(payload: dict) -> dict:
    """Данные для render_intel_sketch из сохранённого JSON."""
    pos = payload.get("pos") or {}
    try:
        mws = float(payload.get("mapWorldSize") or payload.get("map_world_size") or 20500.0)
    except (TypeError, ValueError):
        mws = 20500.0
    out: dict = {
        "event_type": str(payload.get("eventType") or payload.get("event_type") or "").lower(),
        "map_world_size": mws,
        "map_overlay_url": payload.get("mapOverlayUrl") or payload.get("map_overlay_url"),
        "pos_x": float(pos.get("x", 0) or 0),
        "pos_z": float(pos.get("z", 0) or 0),
    }
    mp = payload.get("markerPositions") or payload.get("marker_positions")
    if isinstance(mp, list) and mp:
        out["marker_positions"] = mp
    vt = payload.get("vertices")
    if isinstance(vt, dict):
        out["vertices"] = vt
    return out


def _format_order_embed_description(payload: dict, order_num: int) -> str:
    """Текст embed приказа (без пинга ролей — пинг в content сообщения)."""
    ev = str(payload.get("eventId") or payload.get("event_id") or "")
    zu = str(payload.get("zoneUid") or payload.get("zone_uid") or "")
    square = str(payload.get("square") or "??-??")
    tmpl = str(
        payload.get("templateName")
        or payload.get("templateZoneId")
        or "объект"
    )
    est = int(payload.get("enemyEstimate") or payload.get("enemy_estimate") or 0)
    est = max(1, est)
    pos = payload.get("pos") or {}
    try:
        px = float(pos.get("x", 0))
        pz = float(pos.get("z", 0))
        py = float(pos.get("y", 0))
    except (TypeError, ValueError):
        px, pz, py = 0.0, 0.0, 0.0
    try:
        r_rad = float(payload.get("reportRadiusM") or payload.get("report_radius_m") or 0)
    except (TypeError, ValueError):
        r_rad = 0.0
    et = str(payload.get("eventType") or payload.get("event_type") or "").lower()
    marks = payload.get("markerPositions") or payload.get("marker_positions") or []
    lines_rm: list[str] = []
    if isinstance(marks, list) and marks:
        for m in marks[:10]:
            if not isinstance(m, dict):
                continue
            nm = str(m.get("name") or "?")
            try:
                mx = round(float(m.get("x", 0)), 1)
                mz = round(float(m.get("z", 0)), 1)
            except (TypeError, ValueError):
                mx, mz = 0.0, 0.0
            lines_rm.append(f"**{nm}** X≈{mx}, Z≈{mz}")

    who = "группа противника"
    if et == "convoy":
        who = "колонна / моторизованная группа противника"
    elif et == "patrol":
        who = "патруль / передовая группа противника"
    elif et == "outpost":
        who = f"укрепрайон / **{tmpl}**"
    elif tmpl and tmpl != "объект":
        who = f"силы противника (**{tmpl}**)"

    ref = ev[:8] if ev else (zu[:10] if zu else "—")
    parts = [
        f"**Регистрационный номер приказа:** `{order_num}`",
        "",
        f"По **разведданным** зафиксирован противник: **{who}**.",
        "",
        f"**Квадрат:** {square}",
        f"**Координаты:** X ≈ **{px:.1f}**, Z ≈ **{pz:.1f}**, Y ≈ **{py:.1f}**",
        f"**Ссылка на событие:** `{ref}` · **метка:** `{zu or '—'}`",
    ]
    if r_rad > 0:
        parts.append(f"**Радиус зоны (оценка):** ~{r_rad:.0f} м")
    if lines_rm:
        parts.extend(["", "**Опорные точки:**", " · ".join(lines_rm)])
    parts.extend(
        [
            "",
            f"**Численность (оценка):** ~{est} условных бойцов.",
            "",
            "**Задача:** уничтожить противника на **стратегически важной для нас территории** и восстановить контроль.",
        ]
    )
    return "\n".join(parts)[:3900]


def _format_order_message(payload: dict, order_num: int) -> str:
    """Плоский текст приказа (резерв)."""
    pings = _role_mentions(ORDER_PING_ROLE_IDS)
    return f"{pings}\n## Приказ **№ {order_num}**\n\n{_format_order_embed_description(payload, order_num)}"


def _get_order_payload(event_id: str) -> dict | None:
    with _db() as cx:
        row = cx.execute(
            "SELECT payload_json, zone_uid FROM recon_event WHERE event_id = ?", (event_id,)
        ).fetchone()
    if not row:
        return None
    try:
        p = json.loads(row[0])
    except json.JSONDecodeError:
        return None
    if not isinstance(p, dict):
        return None
    zu = row[1]
    if zu and not p.get("zoneUid") and not p.get("zone_uid"):
        p["zoneUid"] = zu
    if event_id and not p.get("eventId") and not p.get("event_id"):
        p["eventId"] = event_id
    return p


def _delete_event(event_id: str) -> None:
    with _db() as cx:
        cx.execute("DELETE FROM recon_event WHERE event_id = ?", (event_id,))


def _delete_events_for_zone(zone_uid: str) -> None:
    with _db() as cx:
        cx.execute("DELETE FROM recon_event WHERE zone_uid = ?", (zone_uid,))


def _interaction_custom_id(interaction: discord.Interaction) -> str:
    d = interaction.data
    if d is None:
        return ""
    if isinstance(d, dict):
        return str(d.get("custom_id") or "")
    return str(getattr(d, "custom_id", None) or "")


def _message_components_publish_button(event_id: str) -> list[dict]:
    return [
        {
            "type": 1,
            "components": [
                {
                    "type": 2,
                    "style": 4,
                    "label": "Опубликовать приказ",
                    "custom_id": f"publish_order:{event_id}"[:100],
                }
            ],
        }
    ]


def _discord_post_message(
    *,
    content: str | None,
    embed: dict,
    components: list[dict] | None,
    sketch_source: dict | None = None,
) -> str:
    url = f"https://discord.com/api/v10/channels/{CHANNEL_ID}/messages"
    png: bytes | None = None
    if sketch_source:
        try:
            png = render_intel_sketch(sketch_source)
            if not png:
                png = render_route_sketch(sketch_source)
        except Exception:
            png = None
    if png:
        embed = {**embed, "image": {"url": "attachment://recon_route.png"}}
    body: dict = {"embeds": [embed]}
    if content:
        body["content"] = content
    if components:
        body["components"] = components
    if png:
        req_files = [("files[0]", ("recon_route.png", png, "image/png"))]
        r = requests.post(
            url,
            headers={"Authorization": f"Bot {DISCORD_TOKEN}"},
            data={"payload_json": json.dumps(body, ensure_ascii=False)},
            files=req_files,
            timeout=25,
        )
    else:
        r = requests.post(
            url,
            headers={
                "Authorization": f"Bot {DISCORD_TOKEN}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=20,
        )
    r.raise_for_status()
    j = r.json()
    return str(j.get("id") or "")


def _discord_delete_message(message_id: str) -> None:
    url = f"https://discord.com/api/v10/channels/{CHANNEL_ID}/messages/{message_id}"
    r = requests.delete(
        url,
        headers={"Authorization": f"Bot {DISCORD_TOKEN}"},
        timeout=20,
    )
    if r.status_code not in (200, 204):
        r.raise_for_status()


def _run_discord_bot() -> None:
    global _discord_client
    if not DISCORD_TOKEN:
        return
    intents = discord.Intents.default()
    intents.message_content = False

    client = discord.Client(intents=intents)
    _discord_client = client

    @client.event
    async def on_ready() -> None:
        print(f"[recon_bot] Discord: вошёл как {client.user}", flush=True)

    @client.event
    async def on_interaction(interaction: discord.Interaction) -> None:
        # discord.py 2.x: type 3 = message component; сравнение через == надёжнее, чем `is`.
        if interaction.type != InteractionType.component:
            return
        cid = _interaction_custom_id(interaction)
        if cid.startswith("publish_order_done:"):
            return
        if not cid.startswith("publish_order:"):
            return
        event_id = cid.split(":", 1)[1] if ":" in cid else ""
        if not event_id:
            await interaction.response.send_message(
                "Некорректная кнопка.", ephemeral=True
            )
            return
        payload = _get_order_payload(event_id)
        if not payload:
            await interaction.response.send_message(
                "Данные разведки устарели или не найдены.", ephemeral=True
            )
            return
        if not ORDER_CHANNEL_ID:
            await interaction.response.send_message(
                "ORDER_CHANNEL_ID не задан в .env.", ephemeral=True
            )
            return
        msg = interaction.message
        if not msg:
            await interaction.response.send_message(
                "Нет сообщения для обновления.", ephemeral=True
            )
            return

        # Сразу defer — иначе Discord даёт «ошибка взаимодействия», если fetch_channel/edit > 3 с.
        try:
            await interaction.response.defer(ephemeral=False)
        except discord.HTTPException:
            return

        order_num = _next_order_seq()
        sk_png = None
        try:
            sk_png = render_intel_sketch(_sketch_dict_from_payload(payload))
        except Exception:
            sk_png = None
        pings = _role_mentions(ORDER_PING_ROLE_IDS)
        emb = discord.Embed(
            title=f"Боевой приказ № {order_num}",
            description=_format_order_embed_description(payload, order_num),
            color=0xC2410C,
        )
        emb.set_footer(text="Rim · тактическая карта map_api")
        zu = str(payload.get("zoneUid") or payload.get("zone_uid") or "")
        if zu:
            emb.add_field(name="Метка разведки", value=f"`{zu[:48]}`", inline=False)
        view_done = discord.ui.View(timeout=None)
        view_done.add_item(
            discord.ui.Button(
                style=discord.ButtonStyle.secondary,
                label="Приказ опубликован",
                disabled=True,
                custom_id="publish_order_done:0",
            )
        )
        try:
            order_ch = await client.fetch_channel(ORDER_CHANNEL_ID)
            if order_ch is None or not isinstance(
                order_ch, (discord.TextChannel, discord.Thread)
            ):
                await interaction.followup.send(
                    "Канал приказов не найден или бот не видит канал (права / ORDER_CHANNEL_ID).",
                    ephemeral=True,
                )
                return
            try:
                await msg.edit(content=msg.content, embeds=msg.embeds, view=view_done)
            except discord.HTTPException as e_edit:
                print(f"[recon_bot] msg.edit после приказа: {e_edit}", flush=True)
            if sk_png:
                emb.set_image(url="attachment://order_map.png")
                await order_ch.send(
                    content=pings or None,
                    embed=emb,
                    file=discord.File(_io.BytesIO(sk_png), filename="order_map.png"),
                )
            else:
                await order_ch.send(content=pings or None, embed=emb)
            _delete_event(event_id)
            await interaction.followup.send(
                f"Приказ **№ {order_num}** отправлен в канал приказов.", ephemeral=True
            )
        except Exception as exc:
            print(f"[recon_bot] publish_order error: {exc}", flush=True)
            try:
                await interaction.followup.send(
                    f"Ошибка при публикации: `{exc}`", ephemeral=True
                )
            except discord.HTTPException:
                pass

    try:
        client.run(DISCORD_TOKEN)
    except Exception as exc:
        print(f"[recon_bot] Discord клиент остановлен: {exc}", flush=True)


@app.get("/health")
def health():
    ok = bool(DISCORD_TOKEN and CHANNEL_ID and BRIDGE_SECRET)
    return jsonify(
        {
            "ok": ok,
            "discord_token_set": bool(DISCORD_TOKEN),
            "channel_id": CHANNEL_ID,
            "order_channel_id": ORDER_CHANNEL_ID,
            "bridge_secret_set": bool(BRIDGE_SECRET),
        }
    )


@app.get("/panel")
def recon_panel_page():
    return render_template("recon_panel.html")


@app.get("/api/recon/panel/status")
def api_recon_panel_status():
    up = max(0.0, time.monotonic() - _PROCESS_STARTED_MONO)
    if not RECON_PANEL_SECRET:
        return (
            jsonify(
                {
                    "panel_secret_configured": False,
                    "error": "Задайте RECON_PANEL_SECRET в recon_bot/.env и перезапустите бота.",
                    "pid": os.getpid(),
                    "uptime_sec": round(up, 1),
                }
            ),
            503,
        )
    ok_auth = _panel_authorized()
    if not ok_auth:
        return (
            jsonify(
                {
                    "error": "Нужен заголовок X-Recon-Panel-Key (как в RECON_PANEL_SECRET)",
                    "panel_secret_configured": True,
                    "pid": os.getpid(),
                    "uptime_sec": round(up, 1),
                }
            ),
            403,
        )
    ready_ok = bool(DISCORD_TOKEN and CHANNEL_ID and BRIDGE_SECRET)
    tail = _arma_rpt_tail()
    return jsonify(
        {
            "pid": os.getpid(),
            "uptime_sec": round(up, 1),
            "discord_token_set": bool(DISCORD_TOKEN),
            "channel_id": CHANNEL_ID,
            "order_channel_id": ORDER_CHANNEL_ID,
            "bridge_secret_set": bool(BRIDGE_SECRET),
            "ready_ok": ready_ok,
            "panel_secret_configured": bool(RECON_PANEL_SECRET),
            "restart_configured": bool(RECON_PANEL_SECRET and _restart_bundle_ok()),
            "arma_log_tail": tail or "Лог не найден: задайте RECON_ARMA_RPT_PATH или RECON_ARMA_RPT_DIR",
        }
    )


@app.post("/api/recon/service/restart")
def api_recon_service_restart():
    if not RECON_PANEL_SECRET:
        return jsonify({"error": "RECON_PANEL_SECRET не задан"}), 503
    if not _panel_authorized():
        return jsonify({"error": "Неверный X-Recon-Panel-Key"}), 403
    if not _restart_bundle_ok():
        return jsonify({"error": "Нет run_recon_bot.cmd или restart_worker.py"}), 503
    ok, err = _trigger_service_restart()
    if not ok:
        return jsonify({"error": err}), 500
    return jsonify({"ok": True, "message": "Через ~2 с процесс будет завершён; новый экземпляр стартует из run_recon_bot.cmd"})


@app.post("/api/recon/outpost")
def recon_outpost():
    data = request.get_json(silent=True) or {}
    if not _auth(data):
        return jsonify({"error": "invalid token"}), 403
    if not DISCORD_TOKEN or not CHANNEL_ID:
        return jsonify({"error": "DISCORD_TOKEN / RECON_CHANNEL_ID not configured"}), 500
    zu = str(data.get("zone_uid") or "").strip()
    if not zu:
        return jsonify({"error": "zone_uid required"}), 400
    event_id = str(data.get("event_id") or "").strip()
    if not event_id:
        return jsonify({"error": "event_id required (map_api должен слать UUID)"}), 400
    try:
        embed = _embed_from_payload(data)
        _store_order_payload(event_id=event_id, zone_uid=zu, data=data)
        ping = _role_mentions(RECON_PING_ROLE_IDS)
        sketch_src = data
        mid = _discord_post_message(
            content=ping or None,
            embed=embed,
            components=_message_components_publish_button(event_id),
            sketch_source=sketch_src,
        )
        if mid:
            with _db() as cx:
                cx.execute(
                    "INSERT OR REPLACE INTO recon_msg (zone_uid, message_id) VALUES (?, ?)",
                    (zu, mid),
                )
        return jsonify({"ok": True, "message_id": mid})
    except requests.HTTPError as e:
        return jsonify(
            {"error": str(e), "body": e.response.text if e.response else ""}
        ), 502


@app.post("/api/recon/retract")
def recon_retract():
    data = request.get_json(silent=True) or {}
    if not _auth(data):
        return jsonify({"error": "invalid token"}), 403
    zu = str(data.get("zone_uid") or "").strip()
    if not zu:
        return jsonify({"error": "zone_uid required"}), 400
    with _db() as cx:
        row = cx.execute(
            "SELECT message_id FROM recon_msg WHERE zone_uid = ?", (zu,)
        ).fetchone()
    if not row:
        _delete_events_for_zone(zu)
        return jsonify({"ok": True, "removed": False})
    mid = row[0]
    try:
        _discord_delete_message(mid)
    except requests.HTTPError:
        pass
    with _db() as cx:
        cx.execute("DELETE FROM recon_msg WHERE zone_uid = ?", (zu,))
    _delete_events_for_zone(zu)
    return jsonify({"ok": True, "removed": True})


def main() -> None:
    _db().close()
    if DISCORD_TOKEN:
        threading.Thread(target=_run_discord_bot, daemon=True).start()
        time.sleep(1.5)
    app.run(host=HTTP_HOST, port=HTTP_PORT, debug=False, threaded=True)


if __name__ == "__main__":
    main()
