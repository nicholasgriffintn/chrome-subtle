import { Brand } from "./Brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Brand />
      <p>Built for language learners, late-night watchers, and anyone who has ever squinted at a caption.</p>
      <a href="#top">Back to top ↑</a>
    </footer>
  );
}
