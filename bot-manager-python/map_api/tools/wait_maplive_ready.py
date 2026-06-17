#!/usr/bin/env python3
"""
Ждёт в .rpt строку старта mapLive (после полной загрузки миссии), затем печатает хвост лога.
Использование:
  python map_api/tools/wait_maplive_ready.py
  python map_api/tools/wait_maplive_ready.py --rpt "C:\\path\\arma3server_x64_....rpt"
Переменные окружения: RECON_ARMA_RPT_PATH, RECON_ARMA_RPT_DIR (как у recon_bot).
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


def _resolve_rpt(explicit: str | None) -> Path | None:
    if explicit:
        p = Path(explicit).expanduser()
        return p if p.is_file() else None
    path_raw = (os.environ.get("RECON_ARMA_RPT_PATH") or "").strip()
    if path_raw:
        p = Path(path_raw).expanduser()
        if p.is_file():
            return p
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
                        [x for x in d2.glob("arma3server*.rpt") if "profiling" not in x.name.lower()],
                        key=lambda x: x.stat().st_mtime,
                        reverse=True,
                    )
                if not globs:
                    globs = sorted(d2.glob("*.rpt"), key=lambda x: x.stat().st_mtime, reverse=True)
    if not globs:
        prof = Path(r"C:\a3server\profiles")
        if prof.is_dir():
            globs = sorted(prof.glob("arma3server*.rpt"), key=lambda x: x.stat().st_mtime, reverse=True)
    return globs[0] if globs else None


MARKERS = (
    "[RIM_mapLive] Старт",
    "[RIM_mapLive] Старт ",  # на случай другого формата
)


def main() -> None:
    ap = argparse.ArgumentParser(description="Wait for mapLive start line in Arma server .rpt")
    ap.add_argument("--rpt", help="Путь к конкретному .rpt")
    ap.add_argument("--timeout", type=float, default=900.0, help="Секунды ожидания (по умолчанию 900)")
    ap.add_argument("--poll", type=float, default=2.0, help="Интервал опроса файла, с")
    ap.add_argument("--tail", type=int, default=40, help="Строк хвоста после успеха")
    args = ap.parse_args()

    rpt = _resolve_rpt(args.rpt)
    if rpt is None:
        print("Не найден .rpt: задайте --rpt или RECON_ARMA_RPT_PATH / RECON_ARMA_RPT_DIR", file=sys.stderr)
        sys.exit(2)

    print(f"Жду mapLive в {rpt} (таймаут {args.timeout}s)...", flush=True)
    deadline = time.monotonic() + args.timeout
    partial = ""
    seen_live = False

    while time.monotonic() < deadline:
        try:
            data = rpt.read_bytes()
        except OSError as e:
            print(f"read error: {e}", flush=True)
            time.sleep(args.poll)
            continue
        if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
            text = data.decode("utf-16", errors="replace")
        else:
            text = data.decode("utf-8", errors="replace")
        if any(m in text for m in MARKERS):
            seen_live = True
            break
        # сервер ещё не дописал строку — подождём
        time.sleep(args.poll)

    if not seen_live:
        print("Таймаут: нет строки [RIM_mapLive] Старт — сервер не загрузился или другой лог.", file=sys.stderr)
        sys.exit(1)

    print("mapLive OK.", flush=True)
    lines = text.splitlines()
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    for line in lines[-args.tail :]:
        safe = line.encode(enc, errors="replace").decode(enc, errors="replace")
        print(safe)
    sys.exit(0)


if __name__ == "__main__":
    main()
