import { useState } from 'react';

type Props = {
  src?: string;
  alt: string;
  shoot?: string;
};

export function HelpImage({ src, alt, shoot }: Props) {
  const [failed, setFailed] = useState(false);
  const showSlot = !src || failed;
  const caption = shoot ? (
    <p className="help-media-caption">
      <strong>Foto:</strong> {shoot.replace(/^Foto:\s*/i, '')}
    </p>
  ) : null;

  if (showSlot) {
    return (
      <div className="help-media">
        <div className="help-media-slot help-media-img" role="img" aria-label="Captura pendiente">
          <p className="help-media-kicker">Imagen</p>
          <p>Captura pendiente</p>
        </div>
        {caption}
      </div>
    );
  }

  return (
    <figure className="help-shot">
      <img src={src} alt={alt} onError={() => setFailed(true)} />
      {caption}
    </figure>
  );
}
