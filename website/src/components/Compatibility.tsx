export function Compatibility() {
  return (
    <section className="compatibility section" id="how-it-works" aria-labelledby="compatibility-title">
      <div className="compatibility-copy">
        <h2 id="compatibility-title">Designed around each player.</h2>
      </div>
      <div className="platform-table" role="table" aria-label="Platform capabilities">
        <div className="platform-row platform-head" role="row">
          <span role="columnheader">Capability</span><span role="columnheader">YouTube</span><span role="columnheader">Netflix</span>
        </div>
        <PlatformRow label="Native caption styling" youtube="Included" netflix="Included" />
        <PlatformRow label="Official translated line" youtube="When available" netflix="Not exposed" />
        <PlatformRow label="Local SRT / VTT line" youtube="Included" netflix="Included" />
        <PlatformRow label="Data sent elsewhere" youtube="None" netflix="None" />
      </div>
    </section>
  );
}

function PlatformRow({ label, youtube, netflix }: { label: string; youtube: string; netflix: string }) {
  return (
    <div className="platform-row" role="row">
      <strong role="cell">{label}</strong><span role="cell">{youtube}</span><span role="cell">{netflix}</span>
    </div>
  );
}
