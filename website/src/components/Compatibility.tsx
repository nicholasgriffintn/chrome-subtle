const platforms = [
  {
    name: "YouTube",
    detail: "Native styling, translated second lines, local files, movie-like wrapping and Shorts controls."
  },
  {
    name: "Netflix",
    detail: "Native styling, title-language second lines and local files while retaining authored placement."
  },
  {
    name: "BBC iPlayer",
    detail: "Native styling and local files, with programme and speaker colours preserved."
  },
  {
    name: "Disney+",
    detail: "Native styling, title-language second lines and local files."
  },
  {
    name: "Prime Video",
    detail: "Native styling, title-language second lines and local files across regional Prime sites."
  }
];

export function Compatibility() {
  return (
    <section className="compatibility section" id="how-it-works" aria-labelledby="compatibility-title">
      <div className="compatibility-copy">
        <h2 id="compatibility-title">Designed around each player.</h2>
        <p>Subtle adapts to the captions and language tracks each service actually provides.</p>
      </div>
      <ul className="platform-list" aria-label="Supported video services">
        {platforms.map((platform) => (
          <li key={platform.name}>
            <strong>{platform.name}</strong>
            <p>{platform.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
