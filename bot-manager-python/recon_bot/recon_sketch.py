"""PNG-схема маршрута разведки для вложения в Discord (Pillow)."""
from __future__ import annotations

import io
import os
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

_SK_W, _SK_H = 900, 560
_M = 48


def _font(size: int):  # noqa: ANN202
    try:
        from PIL import ImageFont
    except ImportError:
        return None
    for path in (
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if path and os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    try:
        return ImageFont.load_default()
    except Exception:
        return None


def _fetch_overlay_png(url: str, timeout: float = 12.0) -> bytes | None:
    u = (url or "").strip()
    if not u:
        return None
    pr = urlparse(u)
    if pr.scheme not in ("http", "https"):
        return None
    try:
        req = Request(u, headers={"User-Agent": "recon_bot/1.0"})
        with urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except OSError:
        return None


def render_route_sketch(data: dict[str, Any]) -> bytes | None:
    """Полилиния по marker_positions; при map_overlay_url + map_world_size — подложка как на веб-карте."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None

    world_w = float(data.get("map_world_size") or 20500.0)
    if world_w < 2000.0:
        world_w = 20500.0

    pts: list[tuple[float, float, str]] = []
    mpos = data.get("marker_positions")
    if isinstance(mpos, list) and mpos:
        for m in mpos[:16]:
            if not isinstance(m, dict):
                continue
            try:
                x = float(m.get("x", 0))
                z = float(m.get("z", 0))
            except (TypeError, ValueError):
                continue
            name = str(m.get("name") or "?")[:8]
            pts.append((x, z, name))
    if len(pts) < 2:
        verts = data.get("vertices")
        if isinstance(verts, dict):
            for key in ("a", "b"):
                v = verts.get(key)
                if isinstance(v, dict):
                    try:
                        pts.append((float(v.get("x", 0)), float(v.get("z", 0)), key.upper()))
                    except (TypeError, ValueError):
                        pass
    if len(pts) < 2:
        return None

    iw_full, ih_full = _SK_W - 2 * _M, _SK_H - 2 * _M

    raw_overlay = _fetch_overlay_png(str(data.get("map_overlay_url") or ""))
    im: Any
    if raw_overlay:
        try:
            base = Image.open(io.BytesIO(raw_overlay)).convert("RGBA")
            im = Image.new("RGB", (_SK_W, _SK_H), (15, 23, 42))
            _resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS
            scaled = base.resize((iw_full, ih_full), _resample)
            im.paste(scaled, (_M, _M))
        except Exception:
            im = Image.new("RGB", (_SK_W, _SK_H), (15, 23, 42))
    else:
        im = Image.new("RGB", (_SK_W, _SK_H), (15, 23, 42))

    dr = ImageDraw.Draw(im)

    if not raw_overlay:
        grid = (51, 65, 85)
        for g in range(0, iw_full + 1, max(35, iw_full // 14)):
            x0 = _M + g
            dr.line([(x0, _M), (x0, _M + ih_full)], fill=grid, width=1)
        for g in range(0, ih_full + 1, max(35, ih_full // 10)):
            y0 = _M + g
            dr.line([(_M, y0), (_M + iw_full, y0)], fill=grid, width=1)

    def tx(x: float, z: float) -> tuple[int, int]:
        u = (x / world_w) * iw_full
        v = (1.0 - z / world_w) * ih_full
        return (_M + int(max(0.0, min(float(iw_full), u))), _M + int(max(0.0, min(float(ih_full), v))))

    et = str(data.get("event_type") or "").lower()
    if et == "convoy":
        line_rgb = (220, 38, 38)
    elif et == "outpost":
        line_rgb = (217, 119, 6)
    else:
        line_rgb = (37, 99, 235)

    scr = [tx(p[0], p[1]) for p in pts]
    for i in range(len(scr) - 1):
        dr.line([scr[i], scr[i + 1]], fill=line_rgb, width=6 if raw_overlay else 4)

    r_pt = 11
    font = _font(18)
    font_sm = _font(14)
    for i, p in enumerate(pts):
        c = scr[i]
        halo = (255, 255, 255) if raw_overlay else (248, 250, 252)
        dr.ellipse(
            (c[0] - r_pt, c[1] - r_pt, c[0] + r_pt, c[1] + r_pt),
            fill=halo,
            outline=line_rgb,
            width=2,
        )
        label = p[2]
        lx, ly = c[0] + 14, c[1] - 16
        txt_col = (17, 24, 39) if raw_overlay else (241, 245, 249)
        if font:
            dr.text((lx, ly), label, fill=txt_col, font=font)
        else:
            dr.text((lx, ly), label, fill=txt_col)

    if et == "outpost":
        title = (
            "Зона на подложке карты"
            if raw_overlay
            else "Зона (X / Z мира Arma)"
        )
    else:
        title = (
            "Маршрут на подложке мира (как на веб-карте)"
            if raw_overlay
            else "Маршрут (X / Z мира Arma, схема)"
        )
    if font_sm:
        dr.text((_M, 12), title, fill=(148, 163, 184), font=font_sm)
    else:
        dr.text((_M, 12), title, fill=(148, 163, 184))

    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_intel_sketch(data: dict[str, Any]) -> bytes | None:
    """
    Картинка для Discord: маршрут (marker_positions), зона аванпоста (vertices nw..sw),
    или две точки a/b. Иначе None.
    """
    mpos = data.get("marker_positions")
    if isinstance(mpos, list) and len(mpos) >= 2:
        return render_route_sketch(data)

    verts = data.get("vertices")
    if isinstance(verts, dict) and all(k in verts for k in ("nw", "ne", "se", "sw")):
        mps: list[dict[str, Any]] = []
        for key in ("nw", "ne", "se", "sw"):
            v = verts.get(key)
            if not isinstance(v, dict):
                continue
            try:
                mps.append(
                    {
                        "name": key.upper(),
                        "x": float(v.get("x", 0)),
                        "z": float(v.get("z", 0)),
                    }
                )
            except (TypeError, ValueError):
                continue
        if len(mps) >= 3:
            v0 = verts.get("nw")
            if isinstance(v0, dict):
                try:
                    mps.append(
                        {
                            "name": "·",
                            "x": float(v0.get("x", 0)),
                            "z": float(v0.get("z", 0)),
                        }
                    )
                except (TypeError, ValueError):
                    pass
            d2 = {**data, "marker_positions": mps, "event_type": "outpost"}
            return render_route_sketch(d2)

    if isinstance(verts, dict):
        pts2: list[dict[str, Any]] = []
        for key in ("a", "b"):
            v = verts.get(key)
            if isinstance(v, dict):
                try:
                    pts2.append(
                        {
                            "name": key.upper(),
                            "x": float(v.get("x", 0)),
                            "z": float(v.get("z", 0)),
                        }
                    )
                except (TypeError, ValueError):
                    pass
        if len(pts2) >= 2:
            return render_route_sketch({**data, "marker_positions": pts2})

    try:
        cx = float(data.get("pos_x") or 0)
        cz = float(data.get("pos_z") or 0)
    except (TypeError, ValueError):
        return None
    if abs(cx) < 1.0 and abs(cz) < 1.0:
        return None
    one = [{"name": "×", "x": cx, "z": cz}, {"name": "·", "x": cx + 120.0, "z": cz + 120.0}]
    return render_route_sketch({**data, "marker_positions": one, "event_type": data.get("event_type") or "outpost"})
