import { HelpImage } from './HelpImage';
import { HelpYoutube } from './HelpYoutube';
import { IconAlertTriangle, IconCheck, IconUsers } from '../icons';
import { ROLE_LABEL, type AppRole } from '../../lib/roles';
import {
  helpImageSrc,
  helpYoutubeId,
  type HelpBlock,
  type HelpCalloutKind,
  type HelpRoleChip,
} from '../../lib/helpContent';

const ROLE_CHIP: Record<HelpRoleChip, AppRole> = {
  owner: 'owner',
  lead: 'branch_manager',
  seller: 'seller',
};

const CALLOUT_LABEL: Record<HelpCalloutKind, string> = {
  tip: 'Tip',
  ojo: 'Ojo',
  quien: 'Quién puede',
};

function CalloutIcon({ kind }: { kind: HelpCalloutKind }) {
  if (kind === 'ojo') return <IconAlertTriangle size={16} />;
  if (kind === 'quien') return <IconUsers size={16} />;
  return <IconCheck size={16} />;
}

export function HelpBlocks({ blocks, heading }: { blocks: HelpBlock[]; heading: string }) {
  return (
    <div className="help-blocks">
      {blocks.map((b, i) => {
        const key = `${b.type}-${i}`;
        if (b.type === 'p') return <p key={key}>{b.text}</p>;
        if (b.type === 'h') return <h3 key={key}>{b.text}</h3>;
        if (b.type === 'see') {
          return (
            <div key={key} className="help-see">
              <p className="help-see-label">Qué vas a ver en pantalla</p>
              <ul>
                {b.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        }
        if (b.type === 'steps') {
          return (
            <div key={key} className="help-steps">
              {b.title ? <p className="help-steps-title">{b.title}</p> : null}
              <ol>
                {b.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          );
        }
        if (b.type === 'callout') {
          return (
            <aside key={key} className={`help-callout is-${b.kind}`}>
              <span className="help-callout-ico" aria-hidden>
                <CalloutIcon kind={b.kind} />
              </span>
              <div>
                <strong>{CALLOUT_LABEL[b.kind]}</strong>
                <p>{b.text}</p>
              </div>
            </aside>
          );
        }
        if (b.type === 'roles') {
          return (
            <ul key={key} className="help-role-chips" aria-label="Roles">
              {b.who.map((r) => (
                <li key={r}>{ROLE_LABEL[ROLE_CHIP[r]]}</li>
              ))}
            </ul>
          );
        }
        if (b.type === 'video') {
          return (
            <HelpYoutube
              key={key}
              videoId={helpYoutubeId(b.slot)}
              title={`${heading}: ${b.shoot}`}
              shoot={b.shoot}
            />
          );
        }
        return (
          <HelpImage
            key={key}
            src={helpImageSrc(b.slot)}
            alt={b.shoot}
            shoot={b.shoot}
          />
        );
      })}
    </div>
  );
}
