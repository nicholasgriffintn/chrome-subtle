import icon from "../assets/icon.svg";

export function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Subtle home">
      <img src={icon} alt="" width="38" height="38" />
      <span>subtle<i>.</i></span>
    </a>
  );
}
