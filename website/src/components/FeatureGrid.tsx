const features = [
  {
    number: "01",
    title: "A caption studio, not a settings dump",
    copy: "Start with nine presets, then tune 18 fonts, colour, spacing, surfaces, alignment and position with a live preview.",
    accent: "amber"
  },
  {
    number: "02",
    title: "Learn a new language while you watch",
    copy: "Use a second track supplied by YouTube, Netflix, Disney+ or Prime Video—or add your own SRT or VTT file on any supported site.",
    accent: "mint"
  },
  {
    number: "03",
    title: "Cleaner captions, shaped for the screen",
    copy: "Wrap long lines into a movie-like block, optimise captions for Shorts, adjust timing and hide sound cues, music, speaker labels or custom phrases.",
    accent: "paper"
  }
];

export function FeatureGrid() {
  return (
    <section className="features section" id="features" aria-labelledby="features-title">
      <div className="section-heading">
        <p className="eyebrow"></p>
        <h2 id="features-title">Stop fighting the player.<br />Start following the story.</h2>
      </div>
      <div className="feature-grid">
        {features.map((feature) => (
          <article className={`feature-card accent-${feature.accent}`} key={feature.number}>
            <span className="feature-number">{feature.number}</span>
            <div className="feature-glyph" aria-hidden="true"><i /><i /></div>
            <h3>{feature.title}</h3>
            <p>{feature.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
