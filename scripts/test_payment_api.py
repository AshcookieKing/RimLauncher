#!/usr/bin/env python3
"""Тест API оплаты Rim Conflict (шлюз + бот)."""
from __future__ import annotations

import json
import os
import sys

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

API = os.getenv("RIM_LAUNCHER_API", "http://109.248.4.174:5003").rstrip("/")
SECRET = os.getenv("RIM_PAYMENT_POLL_SECRET", "rim-payment-poll")
HEADERS = {"X-Poller-Secret": SECRET}


def main() -> None:
    print(f"API: {API}\n")

    r = requests.get(f"{API}/api/launcher/donate/health", timeout=15)
    print("1) GET /donate/health", r.status_code)
    health = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if health:
        print(json.dumps(health, ensure_ascii=False, indent=2))
    else:
        print("(эндпоинт ещё не на сервере — перезапустите бота с обновлённым launcher_api.py)")
        health = {}

    r = requests.get(f"{API}/api/launcher/donate/pending-list", headers=HEADERS, timeout=15)
    print("\n2) GET /donate/pending-list", r.status_code)
    pending = r.json()
    print(json.dumps(pending, ensure_ascii=False, indent=2))

    orders = pending.get("orders") or []
    test_orders = [o for o in orders if int(o.get("amount_rub") or 0) <= 10]
    if test_orders:
        oid = int(test_orders[0]["id"])
        kopecks = int(test_orders[0].get("pay_amount_kopecks") or 0)
        print(f"\n3a) POST /donate/test-confirm order_id={oid}")
        r = requests.post(
            f"{API}/api/launcher/donate/test-confirm",
            headers={**HEADERS, "Content-Type": "application/json"},
            json={"order_id": oid},
            timeout=30,
        )
        if r.headers.get("content-type", "").startswith("application/json"):
            print(r.status_code, json.dumps(r.json(), ensure_ascii=False, indent=2))
        else:
            print(r.status_code, "(нет test-confirm — используем gateway-paid)")
            r = requests.post(
                f"{API}/api/launcher/donate/gateway-paid",
                headers={**HEADERS, "Content-Type": "application/json"},
                json={
                    "order_id": oid,
                    "operation_id": f"test_script_{oid}",
                    "amount_kopecks": kopecks,
                },
                timeout=30,
            )
            print(r.status_code, json.dumps(r.json(), ensure_ascii=False, indent=2))
    else:
        print("\n3) test-confirm пропущен (нет pending тест-заказов ≤10 ₽)")

    r = requests.post(f"{API}/api/launcher/donate/poll-pending", headers=HEADERS, timeout=45)
    print("\n4) POST /donate/poll-pending", r.status_code)
    print(json.dumps(r.json(), ensure_ascii=False, indent=2))

    print("\n5) POST /donate/webhook/boosty (тест webhook, фейковый order_id=999)")
    r = requests.post(
        f"{API}/api/launcher/donate/webhook/boosty",
        headers={"Content-Type": "application/json"},
        json={"secret": os.getenv("BOOSTY_WEBHOOK_SECRET", "rim-boosty-webhook"), "order_id": 999},
        timeout=15,
    )
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    print(r.status_code, json.dumps(body, ensure_ascii=False))
    if r.status_code == 400 and "не найден" in str(body.get("error", "")).lower():
        print("   → webhook принимает запросы (заказ 999 не существует — это норма)")

    if not health.get("yoomoney_configured"):
        print(
            "\n[!] YOOMONEY_TOKEN не задан на сервере бота — добавьте в .env и перезапустите бота.\n"
            "    Запустите шлюз: python payment_gateway.py (с тем же токеном в .env)"
        )
    print(
        "\n[i] Boosty: официального API для автопроверки нет. Варианты:\n"
        "    • ЮMoney в лаунчере (авто через payment_gateway.py)\n"
        "    • Boosty + webhook → /api/launcher/donate/webhook/boosty\n"
        "    • Boosty + ключ → RIM POINT → «Активировать ключ»"
    )


if __name__ == "__main__":
    main()
