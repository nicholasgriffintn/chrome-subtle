const features = [
  {
    number: "01",
    title: "A caption studio, not a settings dump",
    copy: "Tune type, text, backdrop and window layers independently, then choose an edge treatment, size and position with a live preview.",
    accent: "amber"
  },
  {
    number: "02",
    title: "Learn a new language while you watch",
    copy: "Pair YouTube's supplied caption track with a translated line. On supported sites, import a timed SRT or VTT file as the second line.",
    accent: "mint"
  },
  {
    number: "03",
    title: "Timing controls for imperfect files",
    copy: "Nudge an imported track forwards or backwards without editing it. Optional cleanup hides bracketed sound cues when you want less visual noise.",
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
