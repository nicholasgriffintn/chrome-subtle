import { Compatibility } from "./components/Compatibility";
import { FeatureGrid } from "./components/FeatureGrid";
import { Hero } from "./components/Hero";
import { Installation } from "./components/Installation";
import { Privacy } from "./components/Privacy";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

export default function App() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <FeatureGrid />
        <Compatibility />
        <Privacy />
        <Installation />
      </main>
      <SiteFooter />
    </>
  );
}
