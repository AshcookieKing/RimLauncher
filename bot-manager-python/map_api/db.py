from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Sequence

from map_api.config import (
    DB_AUTH_PLUGIN,
    DB_DEFAULT_AUTH_PLUGIN,
    DB_HOST,
    DB_NAME,
    DB_PASSWORD,
    DB_PORT,
    DB_USER,
    MAP_API_DB_DRIVER,
)

try:
    import mariadb  # noqa: F401

    _HAS_MARIADB = True
except ImportError:
    _HAS_MARIADB = False

try:
    import mysql.connector  # noqa: F401

    _HAS_MYSQL_CONNECTOR = True
except ImportError:
    _HAS_MYSQL_CONNECTOR = False

import pymysql
from pymysql import connections as pymysql_connections
from pymysql import err as pymysql_err
from pymysql.cursors import DictCursor


def _pymysql_password(value: str) -> bytes | str:
    if value is None or value == "":
        return ""
    try:
        value.encode("latin-1")
    except UnicodeEncodeError:
        return value.encode("utf-8")
    return value


def _connect_pymysql() -> pymysql.connections.Connection:
    saved = pymysql_connections._DEFAULT_AUTH_PLUGIN
    kw = {
        "host": DB_HOST,
        "port": DB_PORT,
        "user": DB_USER,
        "password": _pymysql_password(DB_PASSWORD),
        "database": DB_NAME,
        "charset": "utf8mb4",
        "cursorclass": DictCursor,
        "autocommit": True,
    }
    try:
        if DB_DEFAULT_AUTH_PLUGIN:
            pymysql_connections._DEFAULT_AUTH_PLUGIN = DB_DEFAULT_AUTH_PLUGIN
            conn = pymysql.connect(**kw)
            setattr(conn, "_map_api_impl", "pymysql")
            return conn
        try:
            conn = pymysql.connect(**kw)
            setattr(conn, "_map_api_impl", "pymysql")
            return conn
        except pymysql_err.OperationalError as e:
            msg = str(e).lower() if e.args else ""
            if e.args and e.args[0] == 2059 and ("gssapi" in msg or "auth plugin" in msg):
                for plugin in ("mysql_native_password", "caching_sha2_password"):
                    pymysql_connections._DEFAULT_AUTH_PLUGIN = plugin
                    try:
                        conn = pymysql.connect(**kw)
                        setattr(conn, "_map_api_impl", "pymysql")
                        return conn
                    except pymysql_err.OperationalError:
                        continue
                raise
            raise
    finally:
        pymysql_connections._DEFAULT_AUTH_PLUGIN = saved


def _connect_mariadb():
    import mariadb

    kw: dict[str, Any] = {
        "host": DB_HOST,
        "port": DB_PORT,
        "user": DB_USER,
        "password": "" if DB_PASSWORD is None else str(DB_PASSWORD),
        "database": DB_NAME,
        "autocommit": True,
    }
    conn = mariadb.connect(**kw)
    setattr(conn, "_map_api_impl", "mariadb")
    return conn


def _connect_mysql_connector():
    import mysql.connector
    from mysql.connector import errors as mce

    base_kw: dict[str, Any] = {
        "host": DB_HOST,
        "port": DB_PORT,
        "user": DB_USER,
        "password": DB_PASSWORD if DB_PASSWORD else None,
        "database": DB_NAME,
        "charset": "utf8mb4",
        "collation": "utf8mb4_unicode_ci",
        "autocommit": True,
        "use_pure": True,
    }
    if DB_AUTH_PLUGIN:
        base_kw["auth_plugin"] = DB_AUTH_PLUGIN

    try:
        conn = mysql.connector.connect(**base_kw)
    except mce.Error:
        if DB_AUTH_PLUGIN:
            raise
        base_kw["auth_plugin"] = "mysql_native_password"
        conn = mysql.connector.connect(**base_kw)
    setattr(conn, "_map_api_impl", "mysqlconnector")
    return conn


def _connect_mysql() -> Any:
    driver = MAP_API_DB_DRIVER
    if driver == "pymysql":
        return _connect_pymysql()
    if driver == "mariadb":
        if not _HAS_MARIADB:
            raise RuntimeError("Установите: pip install mariadb")
        return _connect_mariadb()
    if driver == "mysqlconnector":
        if not _HAS_MYSQL_CONNECTOR:
            raise RuntimeError("Установите: pip install mysql-connector-python")
        return _connect_mysql_connector()

    # auto: MariaDB Connector → Oracle mysql-connector → PyMySQL (PyMySQL часто бесполезен при GSSAPI)
    errors: list[tuple[str, BaseException]] = []
    if _HAS_MARIADB:
        try:
            return _connect_mariadb()
        except BaseException as e:
            errors.append(("mariadb", e))
    if _HAS_MYSQL_CONNECTOR:
        try:
            return _connect_mysql_connector()
        except BaseException as e:
            errors.append(("mysql.connector", e))
    try:
        return _connect_pymysql()
    except BaseException as e:
        errors.append(("pymysql", e))
    parts = [f"{name}: {type(ex).__name__}: {ex}" for name, ex in errors]
    hint = ""
    for name, ex in errors:
        if name == "mariadb" and "using password: no" in str(ex).lower():
            hint = (
                " Для mariadb «using password: NO» значит не передан пароль: задайте DB_PASSWORD "
                "(в PowerShell перед запуском) или создайте файл map_api/local.env по образцу local.env.example."
            )
            break
    raise RuntimeError(
        "Не удалось подключиться к MySQL/MariaDB. На Windows с GSSAPI нужен пакет `mariadb` "
        "(режим auto). Учётные данные: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME. "
        "Попытки: "
        + " | ".join(parts)
        + hint
    ) from errors[-1][1]


@contextmanager
def _cursor(conn: Any) -> Iterator[Any]:
    impl = getattr(conn, "_map_api_impl", "pymysql")
    if impl in ("mysqlconnector", "mariadb"):
        cur = conn.cursor(dictionary=True)
    else:
        cur = conn.cursor()
    try:
        yield cur
    finally:
        cur.close()


@contextmanager
def get_connection() -> Iterator[Any]:
    conn = _connect_mysql()
    try:
        yield conn
    finally:
        conn.close()


def query_all(sql: str, args: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with _cursor(conn) as cur:
            cur.execute(sql, args or ())
            return list(cur.fetchall())


def insert_returning_id(sql: str, args: Sequence[Any] | None = None) -> int:
    with get_connection() as conn:
        with _cursor(conn) as cur:
            cur.execute(sql, args or ())
            return int(cur.lastrowid)


def mutate(sql: str, args: Sequence[Any] | None = None) -> int:
    with get_connection() as conn:
        with _cursor(conn) as cur:
            cur.execute(sql, args or ())
            return int(cur.rowcount)
