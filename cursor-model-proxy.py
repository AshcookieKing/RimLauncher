"""OpenAI-compatible proxy: Cursor-safe model names + Kiro payload cleanup."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = os.environ.get("OMNIROUTE_UPSTREAM", "http://127.0.0.1:20128").rstrip("/")
PORT = int(os.environ.get("CURSOR_PROXY_PORT", "20127"))
MAX_MESSAGES = int(os.environ.get("CURSOR_PROXY_MAX_MESSAGES", "40"))

MODEL_MAP = {
    "omni-sonnet": "kr/claude-sonnet-4.5",
    "omni-haiku": "kr/claude-haiku-4.5",
}

DROP_KEYS = {
    "store",
    "metadata",
    "parallel_tool_calls",
    "service_tier",
    "prediction",
    "audio",
    "modalities",
    "reasoning",
    "text",
    "truncation",
}


def content_to_text(content) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                kind = part.get("type")
                if kind == "text":
                    parts.append(str(part.get("text", "")))
                elif kind == "input_text":
                    parts.append(str(part.get("text", "")))
                elif kind == "tool_result":
                    parts.append(f"[tool result]\n{part.get('content', '')}")
                elif kind == "output_text":
                    parts.append(str(part.get("text", "")))
                else:
                    parts.append(json.dumps(part, ensure_ascii=False))
            else:
                parts.append(str(part))
        return "\n".join(p for p in parts if p)
    return str(content)


def normalize_role(role: str | None) -> str:
    if role in ("user", "assistant", "system"):
        return role
    return "user"


def simplify_messages(messages: list) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = normalize_role(msg.get("role"))
        content = content_to_text(msg.get("content"))
        if not content and msg.get("tool_calls"):
            content = json.dumps(msg["tool_calls"], ensure_ascii=False)
        if not content and msg.get("function_call"):
            content = json.dumps(msg["function_call"], ensure_ascii=False)
        out.append({"role": role, "content": content or "(empty)"})
    return out[-MAX_MESSAGES:]


def normalize_payload(payload: dict) -> dict:
    model = payload.get("model")
    if model in MODEL_MAP:
        payload["model"] = MODEL_MAP[model]

    if "input" in payload and "messages" not in payload:
        raw = payload.pop("input")
        if isinstance(raw, str):
            payload["messages"] = [{"role": "user", "content": raw}]
        elif isinstance(raw, list):
            payload["messages"] = simplify_messages(raw)
        payload.pop("instructions", None)

    if "messages" in payload and isinstance(payload["messages"], list):
        payload["messages"] = simplify_messages(payload["messages"])

    for key in list(payload.keys()):
        if key in DROP_KEYS:
            payload.pop(key, None)

    if payload.get("tools"):
        payload.pop("tools", None)
    if payload.get("tool_choice"):
        payload.pop("tool_choice", None)

    payload.setdefault("max_tokens", 8192)
    return payload


def forward(method: str, path: str, headers: dict[str, str], body: bytes | None) -> tuple[int, bytes, dict[str, str]]:
    url = f"{UPSTREAM}{path}"
    req = urllib.request.Request(url, data=body, method=method)
    skip = {"host", "content-length", "transfer-encoding", "connection"}
    for key, value in headers.items():
        if key.lower() not in skip:
            req.add_header(key, value)

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = resp.read()
            out_headers = {k: v for k, v in resp.headers.items()}
            return resp.status, data, out_headers
    except urllib.error.HTTPError as err:
        data = err.read()
        out_headers = {k: v for k, v in err.headers.items()}
        return err.code, data, out_headers


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[cursor-proxy] {self.address_string()} {fmt % args}")

    def _handle(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else None

        if body and self.path.rstrip("/").endswith("/chat/completions"):
            try:
                payload = json.loads(body.decode("utf-8"))
                before = payload.get("model")
                msg_count = len(payload.get("messages") or payload.get("input") or [])
                payload = normalize_payload(payload)
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.log_message(
                    "model %s -> %s, messages %s -> %s",
                    before,
                    payload.get("model"),
                    msg_count,
                    len(payload.get("messages") or []),
                )
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

        headers = {k: v for k, v in self.headers.items()}
        status, data, resp_headers = forward(self.command, self.path, headers, body)

        self.send_response(status)
        for key, value in resp_headers.items():
            if key.lower() not in {"transfer-encoding", "connection"}:
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        self._handle()

    def do_POST(self) -> None:
        self._handle()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Cursor model proxy on http://127.0.0.1:{PORT}")
    print(f"Upstream: {UPSTREAM}")
    print("Cursor model names:", ", ".join(MODEL_MAP))
    server.serve_forever()


if __name__ == "__main__":
    main()
