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
          Settings and imported subtitle files stay in Chrome's local extension storage. Subtle has no account system, analytics, advertising, remote scripts or translation service.
        </p>
        <ul>
          <li>Only runs on supported sites</li>
          <li>Requests storage permission only</li>
          <li>Never uploads imported subtitle files</li>
        </ul>
      </div>
    </section>
  );
}
