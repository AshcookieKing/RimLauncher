"""Отдельный процесс: пауза → taskkill родителя → снова run_recon_bot.cmd из корня репо."""
from __future__ import annotations

import os
import subprocess
import sys
import time


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: restart_worker.py PARENT_PID REPO_ROOT", file=sys.stderr)
        sys.exit(2)
    parent_pid = int(sys.argv[1])
    repo_root = os.path.abspath(sys.argv[2])
    bat = os.path.join(repo_root, "run_recon_bot.cmd")
    if not os.path.isfile(bat):
        print("ERROR: run_recon_bot.cmd not found in repo root", file=sys.stderr)
        sys.exit(1)
    time.sleep(2)
    if os.name == "nt":
        subprocess.call(
            ["taskkill", "/PID", str(parent_pid), "/F"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        rq = repo_root.replace('"', '""')
        subprocess.Popen(
            f'cmd /c cd /d "{rq}" && start "recon_bot" cmd /k run_recon_bot.cmd',
            shell=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        try:
            os.kill(parent_pid, 15)
        except ProcessLookupError:
            pass
        time.sleep(1)
        subprocess.Popen(
            [sys.executable, "-m", "recon_bot.app"],
            cwd=repo_root,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )


if __name__ == "__main__":
    main()
