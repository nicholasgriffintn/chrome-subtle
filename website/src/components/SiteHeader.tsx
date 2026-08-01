import { Brand } from "./Brand";

export function SiteHeader() {
  return (
    <header className="site-header" id="top">
      <Brand />
      <nav aria-label="Main navigation">
        <a href="#features">Features</a>
        <a href="#privacy">Privacy</a>
        <a className="nav-download" href="/subtle.zip" download>Download</a>
      </nav>
    </header>
  );
}
