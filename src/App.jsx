import { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from './components/TitleBar';
import Background from './components/Background';
import LaunchDock from './components/LaunchDock';
import PlayerCard from './components/PlayerCard';
import NewsModal from './components/NewsModal';
import HolonetModal, { HolonetStrip } from './components/HolonetModal';
import NewsToast from './components/NewsToast';
import SettingsPanel from './components/SettingsPanel';
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
import CharacterVerifyModal from './components/CharacterVerifyModal';
import DonateModal from './components/DonateModal';
import LogoHolo from './components/LogoHolo';
import { useEscapeClose } from './hooks/useEscapeClose';
import { bindUiSounds } from './utils/uiSounds';
import './styles/app.css';

const RP_RULES_URL = 'http://109.248.4.174:8090/';
const api = window.rimLauncher;

export default function App() {
  const [settings, setSettings] = useState(null);
  const [discord, setDiscord] = useState(null);
  const [events, setEvents] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, message: 'Готов к запуску' });
  const [launching, setLaunching] = useState(false);
  const [view, setView] = useState('home');
  const [newsOpen, setNewsOpen] = useState(false);
  const [holonetOpen, setHolonetOpen] = useState(false);
  const [holonetFocusId, setHolonetFocusId] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideTutorial, setGuideTutorial] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportInitialMode, setSupportInitialMode] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyMode, setVerifyMode] = useState('new');
  const [verifyPrefill, setVerifyPrefill] = useState(null);
  const [donateOpen, setDonateOpen] = useState(false);
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
  const [updateChecked, setUpdateChecked] = useState(false);
  const seenNewsRef = useRef(new Set());
  const profileNickCreatedRef = useRef(new Set());
  const notifiedEventsRef = useRef(new Set());

  const applyDiscord = useCallback((data) => {
    if (!data) return;
    setDiscord((prev) => {
      const next = { ...data };
      // Не затираем ленты пустыми ответами при таймауте API
      if ((!next.news || next.news.length === 0) && prev?.news?.length) next.news = prev.news;
      if ((!next.holonet || next.holonet.length === 0) && prev?.holonet?.length) next.holonet = prev.holonet;
      // character_verifications: не кэшируем при явном ответе API (иначе pending «залипает»)
      if (next.character_verifications == null && prev?.character_verifications?.length) {
        next.character_verifications = prev.character_verifications;
      }
      if (prev?.profile && next.profile && !next.profile.display_name && prev.profile.display_name) {
        next.profile = { ...prev.profile, ...next.profile };
      }
      return next;
    });
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

  const openVerify = useCallback((opts = {}) => {
    setVerifyMode(opts.mode || 'new');
    setVerifyPrefill(opts.prefill || null);
    setVerifyOpen(true);
  }, []);

  const closeVerify = useCallback(() => {
    setVerifyOpen(false);
    setVerifyMode('new');
    setVerifyPrefill(null);
  }, []);

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
    const unbind = bindUiSounds(document);
    return () => unbind?.();
  }, []);

  useEffect(() => {
    if (!settings) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const info = await api.checkForUpdates?.();
        if (!cancelled && info?.updateAvailable) setUpdateInfo(info);
      } catch {}
      if (!cancelled) setUpdateChecked(true);
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
    const nick =
      discord?.unit_application?.profile_nickname ||
      (discord?.character_verification?.status === 'approved'
        ? discord.character_verification.profile_nickname || discord.character_verification.character_nick
        : null);
    if (!nick || profileNickCreatedRef.current.has(nick)) return;
    profileNickCreatedRef.current.add(nick);
    (async () => {
      const res = await api.createProfile({ nickname: String(nick).slice(0, 32), faceIndex: 0 });
      if (res?.ok && res.profile) {
        await api.saveSettings({
          playerName: res.profile.displayName,
          activeProfileId: res.profile.id,
        });
        await refreshDiscord();
      }
    })();
  }, [
    discord?.unit_application?.profile_nickname,
    discord?.character_verification?.status,
    discord?.character_verification?.character_nick,
    discord?.character_verification?.profile_nickname,
    refreshDiscord,
  ]);

  // Пока заявка на верификацию pending — чаще обновляем статус (без блокировки UI)
  useEffect(() => {
    const hasPending =
      discord?.character_verification?.status === 'pending' ||
      (discord?.character_verifications || []).some((v) => v.status === 'pending');
    if (!hasPending) return undefined;
    const t = setInterval(() => {
      refreshDiscord().catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [discord?.character_verification?.status, discord?.character_verifications, refreshDiscord]);

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
    setSettings((s) => ({ ...s, ...saved, tutorialComplete: true }));
    setGuideTutorial(false);
  }, []);

  const dismissGuide = useCallback(async () => {
    setGuideOpen(false);
    if (guideTutorial) {
      await completeTutorial();
    }
  }, [guideTutorial, completeTutorial]);

  const closeTopOverlay = useCallback(() => {
    if (donateOpen) {
      setDonateOpen(false);
      return;
    }
    if (verifyOpen) {
      closeVerify();
      return;
    }
    if (leaveOpen) {
      setLeaveOpen(false);
      return;
    }
    if (supportOpen) {
      setSupportOpen(false);
      setSupportInitialMode(null);
      return;
    }
    if (guideOpen) {
      setGuideOpen(false);
      setGuideTutorial(false);
      return;
    }
    if (newsOpen) {
      setNewsOpen(false);
      return;
    }
    if (holonetOpen) {
      setHolonetOpen(false);
      setHolonetFocusId(null);
      return;
    }
    if (calendarOpen) {
      setCalendarOpen(false);
      return;
    }
    if (announcementOpen) {
      setAnnouncementOpen(false);
      return;
    }
    if (view === 'settings') {
      setView('home');
    }
  }, [donateOpen, verifyOpen, leaveOpen, supportOpen, guideOpen, newsOpen, holonetOpen, calendarOpen, announcementOpen, view, closeVerify]);

  useEscapeClose(
    donateOpen ||
      verifyOpen ||
      leaveOpen ||
      supportOpen ||
      guideOpen ||
      newsOpen ||
      holonetOpen ||
      calendarOpen ||
      announcementOpen ||
      view === 'settings',
    closeTopOverlay
  );

  if (!settings || discordAuthed === null || !updateChecked) {
    return (
      <div className="loading-screen">
        <LogoHolo size="lg" />
        <div className="loader-ring" />
        <span>Инициализация…</span>
      </div>
    );
  }

  if (!updateDismissed && updateInfo?.updateAvailable) {
    return <UpdateModal update={updateInfo} onDismiss={() => setUpdateDismissed(true)} />;
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

  if (settings.newbiePromptComplete !== true) {
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
  const supportOnline = discord?.support_online;
  const unitApplication = discord?.unit_application;
  const units = discord?.units;
  const battalion = discord?.battalion;
  const leaveRequest = discord?.leave_request;
  const donationShop = discord?.donation_shop || discord?.donation_tiers;

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
        onOpenHolonet={() => {
          setHolonetFocusId(null);
          setHolonetOpen(true);
        }}
        onOpenGuide={() => {
          setGuideTutorial(false);
          setGuideOpen(true);
        }}
        onOpenSupport={() => setSupportOpen(true)}
        onOpenRpRules={() => api.openUrl(RP_RULES_URL)}
        onOpenDonate={() => setDonateOpen(true)}
      />

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
        <HolonetStrip
          posts={discord?.holonet || []}
          visible={settings.showHolonetOnHome !== false}
          onOpenAll={() => {
            setHolonetFocusId(null);
            setHolonetOpen(true);
          }}
          onOpenPost={(post) => {
            setHolonetFocusId(post?.id || null);
            setHolonetOpen(true);
          }}
        />
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
          leaveApproved={Boolean(discord?.leave_approved_active)}
          onLeaveBattalion={battalion ? () => setLeaveOpen(true) : undefined}
          onJoinSubdivision={() => {
            setSupportInitialMode('unit-select');
            setSupportOpen(true);
          }}
          onOpenVerify={() => openVerify()}
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
        <SettingsPanel
          settings={settings}
          onSave={saveSettings}
          onBack={() => setView('home')}
          api={api}
          discord={discord}
          onOpenVerify={(opts) => {
            setView('home');
            openVerify(opts);
          }}
        />
      )}

      <LaunchDock progress={progress.percent} message={progress.message} launching={launching} onStart={handleStart} />

      <NewsModal
        open={newsOpen}
        news={discord?.news || []}
        tiktokUrl={discord?.tiktok_url}
        onClose={() => setNewsOpen(false)}
        onRefresh={refreshDiscord}
      />

      <HolonetModal
        open={holonetOpen}
        posts={discord?.holonet || []}
        focusId={holonetFocusId}
        onClose={() => {
          setHolonetOpen(false);
          setHolonetFocusId(null);
        }}
        onRefresh={refreshDiscord}
      />

      <DonateModal
        open={donateOpen}
        onClose={() => setDonateOpen(false)}
        profile={profile}
        shop={donationShop}
        api={api}
        onChatOpen={() => refreshDiscord()}
      />

      <GuideModal
        open={guideOpen}
        onClose={dismissGuide}
        api={api}
        tutorialMode={guideTutorial}
        onCompleteTutorial={completeTutorial}
        onOpenVerify={() => openVerify()}
      />

      <CharacterVerifyModal
        open={verifyOpen}
        onClose={closeVerify}
        api={api}
        verification={discord?.character_verification}
        verifications={discord?.character_verifications}
        mode={verifyMode}
        prefill={verifyPrefill}
        onSubmitted={() => {
          refreshDiscord();
        }}
      />

      <SupportHubModal
        open={supportOpen}
        onClose={() => {
          setSupportOpen(false);
          setSupportInitialMode(null);
        }}
        onOpenSettings={() => {
          setSupportOpen(false);
          setSupportInitialMode(null);
          setView('settings');
        }}
        playerName={profile.display_name}
        supportOnline={supportOnline}
        unitApplication={unitApplication}
        units={units}
        api={api}
        initialMode={supportInitialMode}
        leaveApproved={Boolean(discord?.leave_approved_active)}
        battalion={battalion}
        onRefresh={refreshDiscord}
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
