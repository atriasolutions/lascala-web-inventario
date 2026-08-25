import { isYoutubeReady } from '../../lib/helpContent';

type Props = {
  videoId: string;
  title: string;
  shoot?: string;
};

export function HelpYoutube({ videoId, title, shoot }: Props) {
  const caption = shoot ? (
    <p className="help-media-caption">
      <strong>Grabar:</strong> {shoot.replace(/^Video:\s*/i, '')}
    </p>
  ) : null;

  if (!isYoutubeReady(videoId)) {
    return (
      <div className="help-media">
        <div className="help-media-slot help-media-video" role="status">
          <p className="help-media-kicker">Video</p>
          <p>Pronto el video de este módulo</p>
        </div>
        {caption}
      </div>
    );
  }

  const src = `https://www.youtube.com/embed/${videoId.trim()}`;
  return (
    <div className="help-media">
      <div className="help-youtube">
        <iframe
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {caption}
    </div>
  );
}
