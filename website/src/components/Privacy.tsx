export function Privacy() {
  return (
    <section className="privacy section" id="privacy" aria-labelledby="privacy-title">
      <div className="privacy-mark" aria-hidden="true">
        <strong>0</strong>
        <small>trackers</small>
      </div>
      <div className="privacy-copy">
        <h2 id="privacy-title">Your subtitles stay with the film.</h2>
        <p>
          Settings and imported subtitle files stay in Chrome's local extension storage. Platform tracks are requested only from the service inside the active tab. Subtle has no accounts, analytics, advertising, remote scripts or external translation service.
        </p>
        <ul>
          <li>Only runs on supported sites</li>
          <li>Requests site access only when you enable a service</li>
          <li>Never uploads imported subtitle files</li>
          <li>Never stores track URLs or caption text</li>
        </ul>
      </div>
    </section>
  );
}
