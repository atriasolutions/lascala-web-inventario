import { Navigate, NavLink, useParams } from 'react-router-dom';
import { HelpBlocks } from '../components/help/HelpBlocks';
import { useHelpMode } from '../components/help/HelpModeProvider';
import { audienceNote, HELP_CHAPTERS, helpChapterById, isHelpChapterId } from '../lib/helpContent';

export function HelpPage() {
  const { seccion } = useParams();
  const { setActive } = useHelpMode();

  if (!isHelpChapterId(seccion)) {
    return <Navigate to="/ayuda/overview" replace />;
  }

  const chapter = helpChapterById(seccion);
  const note = audienceNote(chapter.audience);

  return (
    <div className="help-page">
      <p className="admin-lede help-lede">
        Guía de piso. Elige un capítulo a la izquierda. El botón <strong>?</strong> del header explica
        cada menú sin navegar.{' '}
        <button type="button" className="btn ghost help-lede-btn" onClick={() => setActive(true)}>
          Activar modo ayuda
        </button>
      </p>

      <div className="help-layout">
        <nav className="help-index" aria-label="Capítulos de la guía">
          {HELP_CHAPTERS.map((item) => (
            <NavLink
              key={item.id}
              to={`/ayuda/${item.id}`}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              {item.navLabel}
            </NavLink>
          ))}
        </nav>

        <article className="help-chapter" key={chapter.id}>
          <header className="help-chapter-head">
            <h2>{chapter.heading}</h2>
            {note ? <span className="help-badge">{note}</span> : null}
          </header>
          <HelpBlocks blocks={chapter.blocks} heading={chapter.heading} />
        </article>

        <aside className="help-figure" aria-hidden="true">
          <img className="help-figure-img" src="/brand/ayuda-modelo.png" alt="" />
        </aside>
      </div>
    </div>
  );
}
