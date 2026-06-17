import argparse
import json
import os
import socket
import sys
import urllib.error
import urllib.request


BASE_URL = "https://agentrouter.org/v1"


def load_local_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def request_json(method, path, token, payload=None):
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/RooVetGit/Roo-Cline",
        "X-Title": "Roo Code",
        "User-Agent": "RooCode/3.54.0",
    }

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {body}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Network error: {error}") from error
    except TimeoutError as error:
        raise RuntimeError("Request timed out. AgentRouter did not answer in time.") from error
    except socket.timeout as error:
        raise RuntimeError("Request timed out. AgentRouter did not answer in time.") from error


def list_models(token):
    result = request_json("GET", "/models", token)
    models = result.get("data", result)

    if isinstance(models, list):
        for model in models:
            if isinstance(model, dict):
                print(model.get("id") or model.get("name") or json.dumps(model, ensure_ascii=False))
            else:
                print(model)
        return

    print(json.dumps(result, ensure_ascii=False, indent=2))


def chat(token, model, prompt):
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt},
        ],
    }
    result = request_json("POST", "/chat/completions", token, payload)

    try:
        print(result["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError):
        print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    load_local_env()

    parser = argparse.ArgumentParser(description="Small AgentRouter API tester.")
    parser.add_argument("--models", action="store_true", help="Show available models.")
    parser.add_argument("--model", default="gpt-4o", help="Model name for chat request.")
    parser.add_argument("--prompt", default="Привет! Ответь коротко по-русски.", help="Prompt for chat request.")
    args = parser.parse_args()

    token = os.environ.get("AGENTROUTER_API_KEY")
    if not token:
        print("Set AGENTROUTER_API_KEY first.", file=sys.stderr)
        print('PowerShell: $env:AGENTROUTER_API_KEY = "sk-..."', file=sys.stderr)
        return 2

    try:
        if args.models:
            list_models(token)
        else:
            chat(token, args.model, args.prompt)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
