import { useEffect, useState } from 'react';
import { useEscapeClose } from '../hooks/useEscapeClose';

export default function GuideModal({ open, onClose, api, onCompleteTutorial, tutorialMode }) {
  const [guide, setGuide] = useState(null);
  const [tab, setTab] = useState('tutorial');
  const [step, setStep] = useState(0);

  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    api.getGuide().then(setGuide).catch(() => {});
    if (tutorialMode) {
      setTab('tutorial');
      setStep(0);
    }
  }, [open, api, tutorialMode]);

  if (!open || !guide) return null;

  const staticGuide = guide.sections || [];
  const remote = guide.remote || {};
  const team = remote.static?.team || guide.team || [];
  const steps = guide.tutorialSteps || [];

  const openDiscordProfile = (member) => {
    if (!member?.discord_id) return;
    api.openUrl?.(`https://discord.com/users/${member.discord_id}`);
  };

  const finishTutorial = () => {
    onCompleteTutorial?.();
    setTab('guide');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-panel guide-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Путеводитель</h2>
          <div className="guide-tabs">
            <button type="button" className={tab === 'tutorial' ? 'active' : ''} onClick={() => setTab('tutorial')}>
              Обучение
            </button>
            <button type="button" className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>
              Гайд
            </button>
            <button type="button" className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
              Команда
            </button>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="modal-body guide-body">
          {tab === 'tutorial' && steps[step] && (
            <div className="tutorial-step">
              <h3>{steps[step].title}</h3>
              <p>{steps[step].text}</p>
              <div className="tutorial-nav">
                {step > 0 && (
                  <button type="button" className="btn-ghost-sm" onClick={() => setStep((s) => s - 1)}>
                    ← Назад
                  </button>
                )}
                {step < steps.length - 1 ? (
                  <button type="button" className="btn-save" onClick={() => setStep((s) => s + 1)}>
                    Далее →
                  </button>
                ) : (
                  <button type="button" className="btn-save" onClick={finishTutorial}>
                    Завершить обучение
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'guide' && (
            <div className="guide-sections">
              {staticGuide.map((sec) => {
                const channelKey = { about: 'about' }[sec.id];
                return (
                  <article key={sec.id} className="guide-section">
                    <h3>{sec.title}</h3>
                    <p>{sec.summary}</p>
                    {sec.bullets?.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                    {(sec.url || sec.urls) && (
                      <div className="guide-links">
                      {sec.url && (
                        <button type="button" className="btn-ghost-sm" onClick={() => api.openUrl(sec.url)}>
                          {sec.id === 'about' ? 'TikTok @starfrontrp' : 'Открыть документ'}
                        </button>
                      )}
                        {sec.urls?.map((url, i) => (
                          <button key={url} type="button" className="btn-ghost-sm" onClick={() => api.openUrl(url)}>
                            {sec.urlLabels?.[i] || `Документ ${i + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                    {(remote.channels?.[channelKey] || []).slice(0, 3).map((post) => (
                      <div key={post.id} className="guide-post">
                        <strong>{post.title}</strong>
                        <p>{post.body?.slice(0, 200)}</p>
                      </div>
                    ))}
                  </article>
                );
              })}
            </div>
          )}

          {tab === 'team' && (
            <ul className="team-list">
              {team.map((m) => (
                <li key={`${m.name}-${m.discord_id || m.role}`}>
                  {m.discord_id ? (
                    <button type="button" className="team-member-link" onClick={() => openDiscordProfile(m)}>
                      <strong>{m.name}</strong>
                    </button>
                  ) : (
                    <strong>{m.name}</strong>
                  )}
                  <span>{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
