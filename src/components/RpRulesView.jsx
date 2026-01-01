import { RP_RULES_SECTIONS } from '../data/rpRulesContent';

export default function RpRulesView({ onBack, standalone = false }) {
  return (
    <div className={`rp-rules-page${standalone ? ' rp-rules-page--standalone' : ''}`}>
      <header className="rp-rules-header">
        <button type="button" className="btn-ghost-sm" onClick={onBack}>
          ← Назад
        </button>
        <div className="rp-rules-header__titles">
          <h1>РП правила StarFront</h1>
          <p>Clone Wars · ArmA 3 · обязательны для всех игроков</p>
        </div>
      </header>

      <div className="rp-rules-scroll">
        {RP_RULES_SECTIONS.map((section) => (
          <section key={section.id} id={`rp-${section.id}`} className="rp-rules-section">
            <h2>{section.title}</h2>
            {section.subtitle && <p className="rp-rules-subtitle">{section.subtitle}</p>}

            {section.paragraphs?.map((p) => (
              <p key={p} className="rp-rules-text">
                {p}
              </p>
            ))}

            {section.terms?.map((term) => (
              <article key={term.abbr} className="rp-rules-term">
                <div className="rp-rules-term__abbr">{term.abbr}</div>
                <div>
                  <strong>{term.name}</strong>
                  <p>{term.text}</p>
                </div>
              </article>
            ))}

            {section.items?.map((item) => (
              <article key={item.heading} className="rp-rules-card">
                <h3>{item.heading}</h3>
                <p>{item.text}</p>
              </article>
            ))}

            {section.bullets?.map((bullet) => (
              <li key={bullet} className="rp-rules-bullet">
                {bullet}
              </li>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
