#!/usr/bin/env python3
"""Bundle all editor subtitle font families INTO Android assets (no runtime web requests).

The font catalog is downloaded only by the GitHub build runner. Generated CSS
uses local /fonts/ paths copied into the final Capacitor APK. Google Fonts font
binaries are distributed under their upstream open-font licenses.
"""
from __future__ import annotations
import hashlib, pathlib, re, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
FONTS_DIR = ROOT / "public" / "fonts"
CSS_FILE = ROOT / "src" / "generated" / "subtitle-fonts.css"
FAMILIES = ["Montserrat","Roboto","Open Sans","Raleway","Nunito","Rubik","Manrope","Jost","Exo 2","Ubuntu","Fira Sans","IBM Plex Sans","PT Sans","PT Serif","Playfair Display","Lora","Merriweather","Cormorant Garamond","Alice","Yeseva One","Oswald","Russo One","Unbounded","Comfortaa","Philosopher","Lobster","Pacifico","Caveat","Marck Script","Press Start 2P"]
SUBSETS = {"latin", "latin-ext", "cyrillic", "cyrillic-ext"}
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

def fetch(url: str) -> bytes:
    last = None
    for retry in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.read()
        except Exception as exc:
            last = exc
            time.sleep((retry + 1) * 1.5)
    raise RuntimeError(f"Bundled subtitle font unavailable: {url}: {last}")

def main() -> None:
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    CSS_FILE.parent.mkdir(parents=True, exist_ok=True)
    output = ["/* Generated offline font catalogue. Sources: Google Fonts; see fonts.google.com/attribution. */"]
    total = 0
    for family in FAMILIES:
        query = "https://fonts.googleapis.com/css2?family=" + urllib.parse.quote(family) + ":wght@400;700&display=swap"
        source = fetch(query).decode("utf-8")
        face_count = 0
        # Google Fonts annotate each @font-face with its language subset.
        faces = re.findall(r"(?:/\*\s*([^*]+?)\s*\*/\s*)?(@font-face\s*\{[^}]+\})", source, re.S)
        for subset, face in faces:
            if subset.strip() not in SUBSETS and len(faces) > 1:
                continue
            match = re.search(r"url\((https://[^)]+)\)\s*format\(['\"]woff2['\"]\)", face)
            if not match:
                continue
            url = match.group(1)
            name = hashlib.sha256(url.encode()).hexdigest()[:18] + ".woff2"
            dest = FONTS_DIR / name
            if not dest.exists() or dest.stat().st_size == 0:
                dest.write_bytes(fetch(url))
            output.append(face.replace(url, "/fonts/" + name))
            face_count += 1
            total += 1
        if face_count == 0:
            raise RuntimeError(f"Font {family} has no local WOFF2 faces. Refusing to release an incomplete font catalog.")
    CSS_FILE.write_text("\n".join(output) + "\n", encoding="utf-8")
    print(f"Bundled {len(FAMILIES)} font families and {total} offline faces ({len(list(FONTS_DIR.glob('*.woff2')))} files).")

if __name__ == "__main__":
    main()
