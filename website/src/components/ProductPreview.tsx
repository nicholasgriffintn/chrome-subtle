export function ProductPreview() {
  return (
    <div className="product-preview" aria-label="Subtle dual subtitle preview">
      <div className="preview-chrome">
        <span className="preview-dot" />
        <span>youtube.com/watch</span>
        <span className="cc-pill">CC · 2</span>
      </div>
      <div className="preview-scene">
        <div className="scene-orbit scene-orbit-one" />
        <div className="scene-orbit scene-orbit-two" />
        <div className="scene-caption">
          <p>The city sounds different after midnight.</p>
          <p>La ciudad suena diferente después de medianoche.</p>
        </div>
      </div>
      <div className="preview-toolbar">
        <div><span className="play-icon">▶</span><span className="timeline"><i /></span></div>
        <span className="toolbar-mark">subtle.</span>
      </div>
      <div className="preview-card preview-card-style">
        <span>STYLE</span>
        <strong>Cinema</strong>
        <i className="colour-swatch" />
      </div>
      <div className="preview-card preview-card-track">
        <span>SECOND LINE</span>
        <strong>Spanish</strong>
        <small>184 cues ready</small>
      </div>
    </div>
  );
}
