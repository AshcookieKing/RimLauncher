#!/usr/bin/env python3
"""
Шлюз оплаты Rim Conflict — запуск с ПК или сервера.

  pip install requests
  set YOOMONEY_TOKEN=ваш_токен
  set RIM_LAUNCHER_API=http://109.248.4.174:5003
  python scripts/payment_gateway.py
"""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timedelta, timezone

try:
    import requests
except ImportError:
    print("Установите: pip install requests")
    sys.exit(1)

API_URL = os.getenv("RIM_LAUNCHER_API", "http://109.248.4.174:5003").rstrip("/")
POLL_SECRET = os.getenv("RIM_PAYMENT_POLL_SECRET", "rim-payment-poll")
INTERVAL_SEC = int(os.getenv("RIM_PAYMENT_POLL_INTERVAL", "15"))
YOOMONEY_TOKEN = (os.getenv("YOOMONEY_TOKEN") or "").strip()
HEADERS = {"X-Poller-Secret": POLL_SECRET}


def yoomoney_operations(records: int = 100) -> list:
    if not YOOMONEY_TOKEN:
        return []
    resp = requests.post(
        "https://yoomoney.ru/api/operation-history",
        headers={"Authorization": f"Bearer {YOOMONEY_TOKEN}"},
        data={"records": records},
        timeout=25,
    )
    resp.raise_for_status()
    return list(resp.json().get("operations") or [])


def fetch_pending_orders() -> list:
    resp = requests.get(f"{API_URL}/api/launcher/donate/pending-list", headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return list(resp.json().get("orders") or [])


def poll_server() -> int:
    resp = requests.post(f"{API_URL}/api/launcher/donate/poll-pending", headers=HEADERS, timeout=45)
    resp.raise_for_status()
    return int(resp.json().get("paid_count") or 0)


def mark_paid_gateway(order_id: int, operation_id: str, amount_kopecks: int) -> bool:
    resp = requests.post(
        f"{API_URL}/api/launcher/donate/gateway-paid",
        headers={**HEADERS, "Content-Type": "application/json"},
        json={"order_id": order_id, "operation_id": operation_id, "amount_kopecks": amount_kopecks},
        timeout=30,
    )
    if resp.status_code == 404:
        return False
    resp.raise_for_status()
    return bool(resp.json().get("success"))


def parse_op_dt(raw: str) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)
    text = str(raw).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except Exception:
        try:
            dt = datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def match_orders(orders: list, operations: list) -> int:
    paid = 0
    for order in orders:
        order_id = int(order["id"])
        pay_kopecks = int(order.get("pay_amount_kopecks") or int(order["amount_rub"]) * 100)
        target = pay_kopecks / 100.0
        created = parse_op_dt(str(order.get("created_at") or ""))
        min_time = created - timedelta(minutes=15)
        for op in operations:
            if op.get("direction") != "in" or op.get("status") != "success":
                continue
            try:
                amount = float(op.get("amount", 0))
            except Exception:
                continue
            if abs(amount - target) > 0.009:
                continue
            op_id = str(op.get("operation_id") or "")
            if not op_id or parse_op_dt(op.get("datetime") or "") < min_time:
                continue
            if mark_paid_gateway(order_id, op_id, pay_kopecks):
                paid += 1
                print(f"  [OK] Заказ #{order_id} ← {amount:.2f} ₽")
            break
    return paid


def cycle_once() -> None:
    try:
        n = poll_server()
        if n:
            print(f"[bot] Оплачено: {n}")
    except Exception as exc:
        print(f"[bot] {exc}", file=sys.stderr)
    if not YOOMONEY_TOKEN:
        return
    try:
        orders = fetch_pending_orders()
        if not orders:
            return
        paid = match_orders(orders, yoomoney_operations(120))
        if paid:
            print(f"[gateway] +{paid}")
    except Exception as exc:
        print(f"[ERR] {exc}", file=sys.stderr)


def main() -> None:
    print(f"Шлюз оплаты → {API_URL}, каждые {INTERVAL_SEC}s, token={'да' if YOOMONEY_TOKEN else 'НЕТ'}")
    while True:
        cycle_once()
        time.sleep(INTERVAL_SEC)


if __name__ == "__main__":
    main()
