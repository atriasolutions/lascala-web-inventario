import { IconHelp } from '../icons';
import { useHelpMode } from './HelpModeProvider';

export function HelpModeToggle() {
  const { active, toggle } = useHelpMode();
  return (
    <button
      type="button"
      className={`icon-btn help-mode-toggle${active ? ' is-on' : ''}`}
      data-help-ignore
      aria-pressed={active}
      aria-label="Ayuda"
      title="Ayuda"
      onClick={toggle}
    >
      <IconHelp size={20} />
    </button>
  );
}
