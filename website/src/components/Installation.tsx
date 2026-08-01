const steps = [
  ["01", "Download", "Save the current extension package."],
  ["02", "Load", "Open chrome://extensions, enable Developer mode, then choose Load unpacked."],
  ["03", "Watch", "Open YouTube or Netflix, turn on captions, then shape them from Subtle."],
];

export function Installation() {
  return (
    <section className="installation section" aria-labelledby="installation-title">
      <div className="section-heading compact">
        <h2 id="installation-title">Three minutes to clearer captions.</h2>
      </div>
      <ol>
        {steps.map(([number, title, copy]) => (
          <li key={number}>
            <span>{number}</span>
            <div><strong>{title}</strong><p>{copy}</p></div>
          </li>
        ))}
      </ol>
      <a className="button button-primary" href="/subtle.zip" download>Download Subtle 0.1.0</a>
      <p className="prototype-note">This is a local-development preview, not yet a Chrome Web Store release.</p>
    </section>
  );
}
