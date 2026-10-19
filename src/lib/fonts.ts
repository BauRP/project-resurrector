/**
 * Subtitle font families are an optional enhancement. The app ships with a system font stack and
 * never blocks on the network: the Google Fonts stylesheet is attached only when the device is
 * online, after hydration, and any load failure is swallowed (the font picker falls back to system faces).
 */
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Roboto:wght@400;700&family=Open+Sans:wght@400;700&family=Raleway:wght@400;700&family=Nunito:wght@400;700&family=Rubik:wght@400;700&family=Manrope:wght@400;700&family=Jost:wght@400;700&family=Exo+2:wght@400;700&family=Ubuntu:wght@400;700&family=Fira+Sans:wght@400;700&family=IBM+Plex+Sans:wght@400;700&family=PT+Sans:wght@400;700&family=PT+Serif:wght@400;700&family=Playfair+Display:wght@400;700&family=Lora:wght@400;700&family=Merriweather:wght@400;700&family=Cormorant+Garamond:wght@400;700&family=Alice&family=Yeseva+One&family=Oswald:wght@400;700&family=Russo+One&family=Unbounded:wght@400;700&family=Comfortaa:wght@400;700&family=Philosopher&family=Lobster&family=Pacifico&family=Caveat:wght@400;700&family=Marck+Script&family=Press+Start+2P&subset=cyrillic&display=swap";
const ID = "optional-subtitle-fonts";

export function loadOptionalFonts(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const attach = () => {
    if (document.getElementById(ID) || !navigator.onLine) return;
    const link = document.createElement("link");
    link.id = ID; link.rel = "stylesheet"; link.href = FONT_HREF; link.crossOrigin = "anonymous";
    link.onerror = () => link.remove();
    document.head.appendChild(link);
  };
  attach();
  window.addEventListener("online", attach);
  return () => window.removeEventListener("online", attach);
}
