"""
BattlEye RCON → сервер Arma 3 (UDP, порт из BEServer_x64.cfg → RConPort; не HTTP).
Используется пакет berconpy (pip install berconpy, Python 3.10+).
"""
from __future__ import annotations

import asyncio
import sys
from typing import Final

_MAX_CMD_LEN: Final[int] = 8000


def _configure_asyncio_for_berconpy() -> None:
    """На Windows по умолчанию ProactorEventLoop ломает UDP-чтение berconpy (WinError 1234)."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def berconpy_installed() -> bool:
    try:
        import berconpy  # noqa: F401
    except ImportError:
        return False
    return True


def sanitize_rcon_command(raw: object) -> str | None:
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s or len(s) > _MAX_CMD_LEN:
        return None
    if "\x00" in s:
        return None
    return s


async def _send_async(host: str, port: int, password: str, command: str) -> str:
    import berconpy
    from berconpy.io import AsyncClientConnector, ConnectorConfig

    from map_api.config import (
        MAP_RCON_CONNECT_TIMEOUT_SEC,
        MAP_RCON_INITIAL_CONNECT_ATTEMPTS,
    )

    be_cfg = ConnectorConfig(
        connection_timeout=float(MAP_RCON_CONNECT_TIMEOUT_SEC),
        initial_connect_attempts=max(1, int(MAP_RCON_INITIAL_CONNECT_ATTEMPTS)),
    )
    proto = AsyncClientConnector(config=be_cfg)
    client = berconpy.RCONClient(protocol=proto)
    async with client.connect(host, port, password):
        return await client.send_command(command)


def send_command_sync(
    host: str,
    port: int,
    password: str,
    command: str,
    *,
    timeout_sec: float,
) -> str:
    if not berconpy_installed():
        raise RuntimeError(
            "Пакет berconpy не установлен. Выполните: pip install berconpy (нужен Python 3.10+)."
        )
    if not password:
        raise RuntimeError("Пароль RCON пуст (MAP_RCON_PASSWORD).")
    _configure_asyncio_for_berconpy()
    return asyncio.run(
        asyncio.wait_for(
            _send_async(host, port, password, command),
            timeout=timeout_sec,
        )
    )
