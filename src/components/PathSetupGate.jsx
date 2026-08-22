import { useEffect, useState } from 'react';
import LogoHolo from './LogoHolo';

function AuthGateBackground() {
  return (
    <div className="auth-gate-bg" aria-hidden="true">
      <img src="./assets/maxresdefaul.jpg" alt="" className="auth-gate-bg-image" />
      <div className="auth-gate-bg-dim" />
      <div className="auth-gate-bg-vignette" />
      <div className="auth-gate-bg-glow" />
    </div>
  );
}

export default function PathSetupGate({ api, settings, onComplete }) {
  const [armaExe, setArmaExe] = useState(settings?.armaExe || settings?.paths?.armaExe || '');
  const [steamPath, setSteamPath] = useState(settings?.steamPath || settings?.paths?.steamPath || '');
  const [workshopDir, setWorkshopDir] = useState(settings?.workshopDir || settings?.paths?.workshopDir || '');
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const suggested = settings?.paths?.suggested;
    if (!suggested) return;
    if (!armaExe && suggested.armaExe) setArmaExe(suggested.armaExe);
    if (!steamPath && suggested.steamPath) setSteamPath(suggested.steamPath);
    if (!workshopDir && suggested.workshopDir) setWorkshopDir(suggested.workshopDir);
  }, [settings, armaExe, steamPath, workshopDir]);

  const applyPick = (res) => {
    if (res?.canceled) return;
    if (res?.errors?.length) setErrors(res.errors);
    else setErrors([]);
    if (res?.armaExe) setArmaExe(res.armaExe);
    if (res?.steamPath) setSteamPath(res.steamPath);
    if (res?.workshopDir) setWorkshopDir(res.workshopDir);
  };

  const autoDetect = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.autoDetectGamePaths?.({ save: false });
      if (!res?.armaExe && !res?.workshopDir) {
        setErrors(['Arma 3 или Workshop не найдены. Укажите пути вручную.']);
        return;
      }
      applyPick(res);
      if (res?.errors?.length) {
        setErrors(res.errors);
        return;
      }
      if (res?.success) {
        const saved = await api.saveGamePaths?.({
          armaExe: res.armaExe,
          steamPath: res.steamPath,
          workshopDir: res.workshopDir,
        });
        if (saved?.success) onComplete?.(saved.settings);
      }
    } catch (e) {
      setErrors([e.message || 'Ошибка автопоиска']);
    } finally {
      setBusy(false);
    }
  };

  const pickArma = async () => {
    setBusy(true);
    try {
      applyPick(await api.pickArmaExe?.());
    } finally {
      setBusy(false);
    }
  };

  const pickSteam = async () => {
    setBusy(true);
    try {
      applyPick(await api.pickSteamLibrary?.());
    } finally {
      setBusy(false);
    }
  };

  const pickWorkshop = async () => {
    setBusy(true);
    try {
      const res = await api.pickWorkshopFolder?.();
      if (res?.canceled) return;
      if (res?.workshopDir) setWorkshopDir(res.workshopDir);
      setErrors(res?.errors || []);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.saveGamePaths?.({ armaExe, steamPath, workshopDir });
      if (!res?.success) {
        setErrors(res?.errors || ['Не удалось сохранить пути']);
        return;
      }
      onComplete?.(res.settings);
    } catch (e) {
      setErrors([e.message || 'Ошибка сохранения']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-gate-overlay">
      <AuthGateBackground />
      <div className="auth-gate-card path-setup-card">
        <header className="auth-gate-header">
          <LogoHolo size="sm" />
          <span>Настройка путей Arma 3</span>
        </header>

        <p className="path-setup-lead">
          Укажите пути вручную или нажмите <strong>Авто</strong> — лаунчер найдёт Arma 3 и Workshop через Steam (все диски).
        </p>

        <div className="path-setup-auto-row">
          <button type="button" className="btn-ghost-sm path-setup-auto-btn" disabled={busy} onClick={autoDetect}>
            Авто
          </button>
          <span className="block-hint">Поиск по реестру и библиотекам Steam</span>
        </div>

        <div className="path-setup-block">
          <div className="path-row">
            <span>Arma 3</span>
            <code>{armaExe || 'Не выбрано'}</code>
          </div>
          <button type="button" className="btn-ghost-sm" disabled={busy} onClick={pickArma}>
            Выбрать arma3_x64.exe…
          </button>
        </div>

        <div className="path-setup-block">
          <div className="path-row">
            <span>Steam</span>
            <code>{steamPath || 'Определится из exe или укажите вручную'}</code>
          </div>
          <button type="button" className="btn-ghost-sm" disabled={busy} onClick={pickSteam}>
            Выбрать папку Steam…
          </button>
        </div>

        <div className="path-setup-block">
          <div className="path-row">
            <span>Workshop</span>
            <code>{workshopDir || 'Определится из exe или укажите вручную'}</code>
          </div>
          <button type="button" className="btn-ghost-sm" disabled={busy} onClick={pickWorkshop}>
            Выбрать папку Workshop…
          </button>
        </div>

        {errors.length > 0 && (
          <div className="path-setup-errors">
            {errors.map((err) => (
              <p key={err} className="form-error">
                {err}
              </p>
            ))}
          </div>
        )}

        <button type="button" className="auth-gate-btn" disabled={busy || !armaExe} onClick={save}>
          {busy ? 'Сохранение…' : 'ПРОДОЛЖИТЬ'}
        </button>
      </div>
    </div>
  );
}
