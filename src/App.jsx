import { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from './components/TitleBar';
import Background from './components/Background';
import LaunchDock from './components/LaunchDock';
import PlayerCard from './components/PlayerCard';
import NewsModal from './components/NewsModal';
import NewsToast from './components/NewsToast';
import SettingsPanel from './components/SettingsPanel';
import DonateModal from './components/DonateModal';
import GuideModal from './components/GuideModal';
import CalendarModal from './components/CalendarModal';
import AnnouncementModal from './components/AnnouncementModal';
import SupportHubModal from './components/SupportHubModal';
import BattalionLeaveModal from './components/BattalionLeaveModal';
import EventToast from './components/EventToast';
import DiscordAuthGate from './components/DiscordAuthGate';
import PathSetupGate from './components/PathSetupGate';
import NewbieGate from './components/NewbieGate';
import UpdateModal from './components/UpdateModal';
import './styles/app.css';

const api = window.rimLauncher;

export default function App() {
  const [settings, setSettings] = useState(null);
  const [discord, setDiscord] = useState(null);
  const [events, setEvents] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, message: 'Готов к запуску' });
  const [launching, setLaunching] = useState(false);
  const [view, setView] = useState('home');
  const [newsOpen, setNewsOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideTutorial, setGuideTutorial] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [focusEvent, setFocusEvent] = useState(null);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [newsToast, setNewsToast] = useState(null);
  const [eventToast, setEventToast] = useState(null);
  const [discordAuthed, setDiscordAuthed] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const seenNewsRef = useRef(new Set());
  const profileNickCreatedRef = useRef(new Set());
  const notifiedEventsRef = useRef(new Set());

  const applyDiscord = useCallback((data) => {
    if (!data) return;
    setDiscord(data);
    const latest = data.news?.[0];
    if (latest && !seenNewsRef.current.has(latest.id)) {
      seenNewsRef.current.add(latest.id);
      setNewsToast(latest);
    }
  }, []);

  const refreshDiscord = useCallback(async () => {
    const data = await api.fetchDiscordData();
    applyDiscord(data);
  }, [applyDiscord]);

  const refreshEvents = useCallback(async () => {
    try {
      const data = await api.getEvents();
      if (data?.success !== false) setEvents(data);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const [s, auth] = await Promise.all([api.getSettings(), api.getDiscordAuthStatus?.() ?? { linked: false }]);
      setSettings(s);
      setDiscordAuthed(Boolean(auth?.linked));
      if (!auth?.linked) return;
      if (!s.tutorialComplete) {
        setGuideTutorial(true);
        setGuideOpen(true);
      }
      const cached = await api.getDiscordData();
      if (cached) {
        cached.news?.forEach((n) => seenNewsRef.current.add(n.id));
        applyDiscord(cached);
      }
    })();

    api.onDiscordData(applyDiscord);
    api.onDiscordAuthUpdated?.((payload) => {
      if (payload?.discordUserId) setDiscordAuthed(true);
    });
    api.onLaunchProgress((p) => setProgress(p));
    api.onLaunchReset(() => {
      setLaunching(false);
      setProgress({ percent: 0, message: 'Готов к запуску' });
    });
    api.onLaunchRunning(() => {
      setProgress({ percent: 100, message: 'Игра запущена' });
    });
    api.onOnlineUpdate((online) => {
      setDiscord((prev) => (prev ? { ...prev, online } : { online, profile: {}, news: [] }));
    });
    api.onRimPointEarned?.((payload) => {
      if (!payload?.success) return;
      setDiscord((prev) =>
        prev
          ? { ...prev, profile: { ...prev.profile, rim_points: payload.rim_points } }
          : prev
      );
    });
    api.onUpdateAvailable?.((info) => {
      if (info?.updateAvailable) setUpdateInfo(info);
    });

    return () => {};
  }, [applyDiscord, refreshDiscord]);

  useEffect(() => {
    if (!settings) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const info = await api.checkForUpdates?.();
        if (!cancelled && info?.updateAvailable) setUpdateInfo(info);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  useEffect(() => {
    if (!settings || settings.showEventCalendar === false) return undefined;
    refreshEvents();
    const evTimer = setInterval(refreshEvents, settings.eventNotificationsEnabled !== false ? 30000 : 60000);
    return () => clearInterval(evTimer);
  }, [settings?.showEventCalendar, settings?.eventNotificationsEnabled, refreshEvents]);

  useEffect(() => {
    if (settings?.eventNotificationsEnabled === false) return;
    const ev = discord?.next_event || events?.next_event;
    const live = [...(events?.live || discord?.events_live || [])];
    if (ev?.is_live && !live.find((e) => e.id === ev.id)) live.push(ev);

    const playBeep = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.08;
        o.start();
        setTimeout(() => o.stop(), 180);
      } catch {}
    };

    for (const e of live) {
      const key = `live-${e.id}`;
      if (notifiedEventsRef.current.has(key)) continue;
      notifiedEventsRef.current.add(key);
      const title = 'Ивент начался!';
      const body = e.title || 'Ивент на сервере';
      api.showNotification?.({ title, body });
      playBeep();
      setEventToast(e);
    }

    if (ev?.is_upcoming && ev.start_at) {
      const start = new Date(ev.start_at).getTime();
      const mins = (start - Date.now()) / 60000;
      if (mins > 0 && mins <= 5) {
        const key = `soon-${ev.id}`;
        if (!notifiedEventsRef.current.has(key)) {
          notifiedEventsRef.current.add(key);
          const title = 'Скоро ивент';
          const body = `${ev.title || 'Ивент'} · через ${Math.ceil(mins)} мин`;
          api.showNotification?.({ title, body });
          playBeep();
          setEventToast({ ...ev, title: body });
        }
      }
    }
  }, [discord, events, settings?.eventNotificationsEnabled, settings]);

  useEffect(() => {
    const nick = discord?.unit_application?.profile_nickname;
    if (!nick || profileNickCreatedRef.current.has(nick)) return;
    profileNickCreatedRef.current.add(nick);
    (async () => {
      const res = await api.createProfile({ nickname: nick, faceIndex: 0 });
      if (res?.ok && res.profile) {
        await api.saveSettings({
          playerName: res.profile.displayName,
          activeProfileId: res.profile.id,
        });
        await refreshDiscord();
      }
    })();
  }, [discord?.unit_application?.profile_nickname, refreshDiscord]);

  const handleStart = useCallback(async () => {
    setLaunching(true);
    setProgress({ percent: 0, message: 'Подготовка…' });
    try {
      const result = await api.prepareLaunch();
      if (!result.ok) {
        setProgress({ percent: 0, message: result.error || 'Ошибка запуска' });
        return;
      }
      setProgress({ percent: 100, message: 'Запуск Arma 3…' });
      setTimeout(() => api.minimize(), 600);
    } catch (e) {
      setProgress({ percent: 0, message: e.message || 'Ошибка' });
    } finally {
      setLaunching(false);
    }
  }, []);

  const saveSettings = useCallback(
    async (next) => {
      try {
        const saved = await api.saveSettings(next);
        setSettings(saved);
        const profileRow = (saved.profiles || []).find((p) => p.id === saved.activeProfileId);
        if (saved.playerName || profileRow) {
          setDiscord((prev) =>
            prev
              ? {
                  ...prev,
                  profile: {
                    ...prev.profile,
                    display_name: saved.playerName || profileRow?.displayName || prev.profile.display_name,
                    in_game_name: saved.playerName || profileRow?.displayName || prev.profile.in_game_name,
                    rank: profileRow?.rank || prev.profile.rank,
                    role: profileRow?.rank || prev.profile.role,
                  },
                }
              : prev
          );
        }
      } catch (e) {
        console.error(e);
      } finally {
        setView('home');
      }
      refreshDiscord().catch(() => {});
    },
    [refreshDiscord]
  );

  const completeTutorial = useCallback(async () => {
    const saved = await api.saveSettings({ tutorialComplete: true });
    setSettings((s) => ({ ...s, ...saved }));
    setGuideTutorial(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pollPendingPayment = async () => {
      try {
        const uid = await api.getDiscordUserId();
        if (!uid || cancelled) return;
        const data = await api.getActiveDonation(uid);
        if (data.order?.status === 'pending') {
          setDonateOpen(true);
        }
      } catch {}
    };
    pollPendingPayment();
    const t = setInterval(pollPendingPayment, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!settings || discordAuthed === null) {
    return (
      <div className="loading-screen">
        <img src="./assets/logo.png" alt="" className="loading-logo" />
        <div className="loader-ring" />
        <span>Инициализация…</span>
      </div>
    );
  }

  if (!discordAuthed) {
    return (
      <DiscordAuthGate
        api={api}
        onAuthenticated={async () => {
          setDiscordAuthed(true);
          const s = await api.getSettings();
          setSettings(s);
          await refreshDiscord();
          if (s.pathsConfigured && s.pathsValid && !s.tutorialComplete) {
            setGuideTutorial(true);
            setGuideOpen(true);
          }
        }}
      />
    );
  }

  if (!settings.newbiePromptComplete) {
    return (
      <NewbieGate
        api={api}
        onComplete={(nextSettings) => {
          setSettings(nextSettings);
        }}
      />
    );
  }

  if (!settings.pathsConfigured || !settings.pathsValid) {
    return (
      <PathSetupGate
        api={api}
        settings={settings}
        onComplete={(nextSettings) => {
          setSettings(nextSettings);
          if (!nextSettings.tutorialComplete) {
            setGuideTutorial(true);
            setGuideOpen(true);
          }
        }}
      />
    );
  }

  const online = discord?.online || {};
  const profile = discord?.profile || {};
  const nextEvent = discord?.next_event || events?.next_event;
  const announcement = discord?.announcement;
  const donationShop = discord?.donation_shop || discord?.donation_tiers;
  const boostyMinDonationRub = discord?.boosty_min_donation_rub;
  const supportOnline = discord?.support_online;
  const unitApplication = discord?.unit_application;
  const units = discord?.units;
  const battalion = discord?.battalion;
  const leaveRequest = discord?.leave_request;

  return (
    <div
      className="app"
      style={{
        '--blur': `${settings.blurAmount ?? 12}px`,
        '--scanline': settings.scanlineIntensity ?? 0.35,
      }}
      data-animations={settings.animationsEnabled !== false ? 'on' : 'off'}
    >
      <Background />
      <div className="holo-grid" />
      <div className="scanlines" />

      <TitleBar
        rimPoints={profile.rim_points ?? 0}
        onOpenSettings={() => setView('settings')}
        onOpenNews={() => setNewsOpen(true)}
        onOpenGuide={() => {
          setGuideTutorial(false);
          setGuideOpen(true);
        }}
        onOpenSupport={() => setSupportOpen(true)}
        onOpenDonate={() => setDonateOpen(true)}
      />

      {!updateDismissed && updateInfo?.updateAvailable && (
        <UpdateModal update={updateInfo} onDismiss={() => setUpdateDismissed(true)} />
      )}

      <NewsToast
        item={newsToast}
        onClose={() => setNewsToast(null)}
        onOpenNews={() => {
          setNewsOpen(true);
          setNewsToast(null);
        }}
      />

      <EventToast
        event={eventToast}
        onClose={() => setEventToast(null)}
        onOpen={(e) => {
          setFocusEvent(e);
          setCalendarOpen(true);
          setEventToast(null);
        }}
      />

      <div className="main-stage">
        <img src="./assets/hero.png" alt="" className="hero-transparent" />
        <PlayerCard
          profile={profile}
          online={online.online ?? 0}
          maxPlayers={online.max_players ?? 0}
          serverStatus={online.status}
          nextEvent={nextEvent}
          announcement={announcement}
          showEventAnnouncement={settings.showEventAnnouncement !== false}
          showEventCalendar={settings.showEventCalendar !== false}
          battalion={battalion}
          leaveApproved={leaveRequest?.status === 'approved'}
          onLeaveBattalion={battalion ? () => setLeaveOpen(true) : undefined}
          onOpenEvent={(event) => {
            setFocusEvent(event);
            setCalendarOpen(true);
          }}
          onOpenAnnouncement={(item) => {
            setActiveAnnouncement(item);
            setAnnouncementOpen(true);
          }}
        />
      </div>

      {view === 'settings' && (
        <SettingsPanel settings={settings} onSave={saveSettings} onBack={() => setView('home')} api={api} />
      )}

      <LaunchDock progress={progress.percent} message={progress.message} launching={launching} onStart={handleStart} />

      <NewsModal open={newsOpen} news={discord?.news || []} onClose={() => setNewsOpen(false)} onRefresh={refreshDiscord} />

      <DonateModal
        open={donateOpen}
        onClose={() => setDonateOpen(false)}
        profile={profile}
        shop={donationShop}
        boostyMinRub={boostyMinDonationRub}
        api={api}
        onChatOpen={() => {
          refreshDiscord();
        }}
      />

      <GuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        api={api}
        tutorialMode={guideTutorial}
        onCompleteTutorial={completeTutorial}
      />

      <SupportHubModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        onOpenSettings={() => {
          setSupportOpen(false);
          setView('settings');
        }}
        playerName={profile.display_name}
        supportOnline={supportOnline}
        unitApplication={unitApplication}
        units={units}
        api={api}
      />

      <BattalionLeaveModal
        open={leaveOpen}
        onClose={() => {
          localStorage.removeItem('rim_unit_app_id');
          setLeaveOpen(false);
          refreshDiscord();
        }}
        battalion={battalion}
        leaveRequest={leaveRequest}
        profile={profile}
        api={api}
      />

      {settings.showEventCalendar !== false && (
        <CalendarModal
          open={calendarOpen}
          onClose={() => setCalendarOpen(false)}
          api={api}
          initialData={events}
          focusEvent={focusEvent || nextEvent}
        />
      )}

      {settings.showEventAnnouncement !== false && (
        <AnnouncementModal
          open={announcementOpen}
          onClose={() => setAnnouncementOpen(false)}
          announcement={activeAnnouncement || announcement}
        />
      )}
    </div>
  );
}
