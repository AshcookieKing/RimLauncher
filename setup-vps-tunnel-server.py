"""One-time VPS setup: SSH key + GatewayPorts for reverse tunnel."""
import os
import sys

import paramiko

HOST = "103.112.69.87"
USER = "root"
PORT = 22
REMOTE_TUNNEL_PORT = 20129
PUB_KEY_PATH = os.path.expanduser("~/.ssh/id_rsa.pub")


def run(client: paramiko.SSHClient, cmd: str) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def main() -> int:
    password = os.environ.get("VPS_ROOT_PASSWORD")
    if not password:
        print("Set VPS_ROOT_PASSWORD env var", file=sys.stderr)
        return 2

    if not os.path.exists(PUB_KEY_PATH):
        print(f"Missing {PUB_KEY_PATH}", file=sys.stderr)
        return 2

    pub = open(PUB_KEY_PATH, encoding="utf-8").read().strip()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(HOST, port=PORT, username=USER, password=password, timeout=20)
    except Exception as exc:
        print(f"SSH login failed: {exc}", file=sys.stderr)
        return 1

    print("SSH login OK")

    run(client, "mkdir -p ~/.ssh && chmod 700 ~/.ssh")
    code, out, err = run(
        client,
        f"grep -F '{pub.split()[1]}' ~/.ssh/authorized_keys >/dev/null 2>&1 || "
        f"echo '{pub}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys",
    )
    if code != 0:
        print("authorized_keys failed:", err or out, file=sys.stderr)
        return 1
    print("SSH public key installed")

    code, out, err = run(client, "grep -E '^GatewayPorts' /etc/ssh/sshd_config || true")
    if "GatewayPorts yes" not in out:
        run(client, "cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak-cursor-tunnel")
        run(
            client,
            "grep -q '^GatewayPorts' /etc/ssh/sshd_config && "
            "sed -i 's/^GatewayPorts.*/GatewayPorts yes/' /etc/ssh/sshd_config || "
            "echo 'GatewayPorts yes' >> /etc/ssh/sshd_config",
        )
        print("GatewayPorts yes enabled")
    else:
        print("GatewayPorts already yes")

    code, out, _ = run(client, "grep -E '^AllowTcpForwarding' /etc/ssh/sshd_config || true")
    if "AllowTcpForwarding yes" not in out:
        run(
            client,
            "grep -q '^AllowTcpForwarding' /etc/ssh/sshd_config && "
            "sed -i 's/^AllowTcpForwarding.*/AllowTcpForwarding yes/' /etc/ssh/sshd_config || "
            "echo 'AllowTcpForwarding yes' >> /etc/ssh/sshd_config",
        )
        print("AllowTcpForwarding yes enabled")
    else:
        print("AllowTcpForwarding already yes")

    run(client, "pkill -f '127.0.0.1:20128' || true")
    code, _, err = run(client, "systemctl restart sshd || service ssh restart")
    if code != 0:
        print("sshd restart failed:", err, file=sys.stderr)
        return 1
    print("sshd restarted")

    for cmd in (
        f"ss -lntp | grep :{REMOTE_TUNNEL_PORT} || true",
        "ufw status 2>/dev/null || true",
        f"iptables -C INPUT -p tcp --dport {REMOTE_TUNNEL_PORT} -j ACCEPT 2>/dev/null || "
        f"iptables -I INPUT -p tcp --dport {REMOTE_TUNNEL_PORT} -j ACCEPT 2>/dev/null || true",
    ):
        code, out, err = run(client, cmd)
        if out.strip():
            print(out.strip())

    client.close()
    print("VPS setup complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
