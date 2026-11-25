"""Prepara la cartella sito-online/ (solo cio' che va pubblicato) dalla cartella frontend/.
Uso: python3 tools/make_online.py  -> poi si scrive l'indirizzo Convex di produzione in sito-online/js/config.js"""
import shutil, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = root / "sito-online"
shutil.rmtree(out, ignore_errors=True)
(out / "js").mkdir(parents=True)
shutil.copy(root / "frontend" / "index.html", out / "index.html")
for f in (root / "frontend" / "js").glob("*.js"):
    shutil.copy(f, out / "js" / f.name)
(out / "js" / "config.js").write_text('// Scrivi qui l\'indirizzo Convex di PRODUZIONE (quello che finisce con .convex.cloud), tra le virgolette.\nwindow.PWC_CONFIG = { convexUrl: "INSERISCI-QUI-L-INDIRIZZO-DI-PRODUZIONE" };\n')
(out / "_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n")
print("pronto:", out, sorted(p.name for p in out.rglob("*") if p.is_file()))
