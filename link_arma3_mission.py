#!/usr/bin/env python3
"""Создаёт junction-ссылку на миссию .vt7 из Git-репозитория в профиль Arma 3."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

DEFAULT_REPO = Path.home() / "Documents" / "GitHub" / "Rim_Conflict"
DEFAULT_PROFILES = Path.home() / "Documents" / "Arma 3 - Other Profiles"


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent


CONFIG_PATH = app_dir() / "link_arma3_mission.json"


def load_config() -> dict:
    if not CONFIG_PATH.is_file():
        return {}
    try:
        with CONFIG_PATH.open(encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[ПРЕДУПРЕЖДЕНИЕ] Не удалось прочитать {CONFIG_PATH}: {exc}")
        return {}


def save_config(repo: Path, profiles: Path) -> None:
    data = {"repo": str(repo), "profiles": str(profiles)}
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def find_missions(repo: Path) -> list[Path]:
    if not repo.is_dir():
        return []
    return sorted(
        p for p in repo.iterdir() if p.is_dir() and p.name.lower().endswith(".vt7")
    )


def list_profiles(profiles_root: Path) -> list[Path]:
    if not profiles_root.is_dir():
        return []
    return sorted(
        (p for p in profiles_root.iterdir() if p.is_dir()),
        key=lambda p: unquote(p.name).casefold(),
    )


def pick_from_list(title: str, items: list[str], allow_cancel: bool = False) -> int | None:
    print(f"\n{title}")
    print("-" * len(title))
    for i, label in enumerate(items, start=1):
        print(f"  {i}. {label}")
    if allow_cancel:
        print("  0. Отмена")
    while True:
        raw = input("Номер: ").strip()
        if allow_cancel and raw == "0":
            return None
        if raw.isdigit():
            idx = int(raw)
            if 1 <= idx <= len(items):
                return idx - 1
        print("Введите номер из списка.")


def is_reparse_point(path: Path) -> bool:
    if not path.exists():
        return False
    try:
        return path.is_symlink() or bool(path.lstat().st_file_attributes & 0x400)
    except OSError:
        return path.is_symlink()


def remove_link(path: Path) -> None:
    if path.is_symlink():
        path.unlink()
        return
    # junction / reparse point on Windows
    subprocess.run(["cmd", "/c", "rmdir", str(path)], check=True)


def create_junction(link: Path, target: Path) -> None:
    link.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(target)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        msg = (result.stderr or result.stdout or "mklink failed").strip()
        raise RuntimeError(msg)


def ensure_link(link: Path, target: Path, *, force: bool) -> None:
    target = target.resolve()
    if not target.is_dir():
        raise FileNotFoundError(f"Источник не найден: {target}")

    if link.exists() or link.is_symlink():
        if link.resolve() == target:
            print(f"Уже связано: {link}")
            return
        if is_reparse_point(link):
            if force or confirm(f"Заменить существующую ссылку?\n  {link}"):
                remove_link(link)
            else:
                print("Отменено.")
                return
        else:
            raise FileExistsError(
                f"В missions уже есть папка (не ссылка): {link}\n"
                "Удалите её вручную или укажите --force."
            )

    create_junction(link, target)
    print(f"Создана ссылка:\n  {link}\n  -> {target}")


def confirm(question: str) -> bool:
    answer = input(f"{question} [y/N]: ").strip().lower()
    return answer in {"y", "yes", "д", "да"}


def parse_args(config: dict) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Связать миссию .vt7 из Git-репозитория с профилем Arma 3."
    )
    parser.add_argument(
        "--repo",
        type=Path,
        default=Path(config.get("repo", DEFAULT_REPO)),
        help=f"Путь к клону репозитория (по умолчанию: {DEFAULT_REPO})",
    )
    parser.add_argument(
        "--profiles",
        type=Path,
        default=Path(config.get("profiles", DEFAULT_PROFILES)),
        help=f"Папка Other Profiles (по умолчанию: {DEFAULT_PROFILES})",
    )
    parser.add_argument(
        "--mission",
        help="Имя папки миссии, например Rim_Conflict_base.vt7 (иначе — выбор из списка)",
    )
    parser.add_argument(
        "--profile",
        help="Имя или номер профиля Arma 3 (иначе — интерактивный выбор)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Заменить существующую ссылку без подтверждения",
    )
    parser.add_argument(
        "--save-config",
        action="store_true",
        help="Сохранить --repo и --profiles в link_arma3_mission.json",
    )
    return parser.parse_args()


def resolve_profile(profiles_root: Path, profile_arg: str | None) -> Path | None:
    profiles = list_profiles(profiles_root)
    if not profiles:
        print(f"[ОШИБКА] Профили не найдены: {profiles_root}")
        return None

    if profile_arg:
        if profile_arg.isdigit():
            idx = int(profile_arg) - 1
            if 0 <= idx < len(profiles):
                return profiles[idx]
            print(f"[ОШИБКА] Нет профиля с номером {profile_arg}")
            return None
        needle = profile_arg.casefold()
        for p in profiles:
            if p.name.casefold() == needle or unquote(p.name).casefold() == needle:
                return p
        print(f"[ОШИБКА] Профиль не найден: {profile_arg}")
        return None

    labels = [unquote(p.name) for p in profiles]
    idx = pick_from_list("Профили Arma 3:", labels, allow_cancel=True)
    return profiles[idx] if idx is not None else None


def resolve_mission(repo: Path, mission_arg: str | None) -> Path | None:
    missions = find_missions(repo)
    if not missions:
        print(f"[ОШИБКА] В репозитории нет папок *.vt7: {repo}")
        return None

    if mission_arg:
        for m in missions:
            if m.name.casefold() == mission_arg.casefold():
                return m
        print(f"[ОШИБКА] Миссия не найдена: {mission_arg}")
        print("Доступно:", ", ".join(m.name for m in missions))
        return None

    if len(missions) == 1:
        print(f"Миссия: {missions[0].name}")
        return missions[0]

    labels = [m.name for m in missions]
    idx = pick_from_list("Миссии в репозитории:", labels, allow_cancel=True)
    return missions[idx] if idx is not None else None


def main() -> int:
    if sys.platform != "win32":
        print("[ОШИБКА] Скрипт рассчитан на Windows.")
        return 1

    config = load_config()
    args = parse_args(config)

    repo = args.repo.expanduser().resolve()
    profiles_root = args.profiles.expanduser().resolve()

    if not repo.is_dir():
        print(f"[ОШИБКА] Репозиторий не найден: {repo}")
        return 1
    if not profiles_root.is_dir():
        print(f"[ОШИБКА] Папка профилей не найдена: {profiles_root}")
        return 1

    if args.save_config:
        save_config(repo, profiles_root)
        print(f"Настройки сохранены: {CONFIG_PATH}")

    mission = resolve_mission(repo, args.mission)
    if mission is None:
        return 1

    profile = resolve_profile(profiles_root, args.profile)
    if profile is None:
        return 1

    link = profile / "missions" / mission.name
    print(f"\nПрофиль: {unquote(profile.name)}")
    print(f"Куда:    {link}")

    try:
        ensure_link(link, mission, force=args.force)
    except (FileExistsError, FileNotFoundError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"[ОШИБКА] {exc}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
