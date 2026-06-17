@echo off
cd /d "%~dp0"
if exist "recon_bot\local_env.cmd" call "recon_bot\local_env.cmd"
python -m recon_bot.app %*
