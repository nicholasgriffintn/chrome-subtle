import { ProductPreview } from "./ProductPreview";

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow"><span /> Local-first subtitle tools</p>
        <h1 id="hero-title">Read every<br /><em>frame.</em></h1>
        <p className="hero-intro">
          Better-looking captions, dual-language playback, and your own subtitle files—across five supported video services, without an account.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="/subtle.zip" download>Download for Chrome</a>
          <a className="text-link" href="#how-it-works">How it works <span>↓</span></a>
        </div>
        <p className="install-note">Manifest V3 · Chrome 120+ · Version 0.2.0</p>
      </div>
      <ProductPreview />
    </section>
  );
}
