"""Genera frontend/index.html (sito collegato ai dati) partendo dall'anteprima approvata, SENZA cambiarne grafica e struttura:
sostituisce solo i dati finti con contenitori riempiti da js/app.js. Le sezioni non ancora collegate mostrano "in arrivo"."""
from bs4 import BeautifulSoup
import sys
src, dst = sys.argv[1], sys.argv[2]
soup = BeautifulSoup(open(src, encoding="utf-8").read(), "html.parser")
new = lambda html: BeautifulSoup(html, "html.parser")
def after(el):  # rimuove tutti i fratelli successivi
    for s in list(el.find_next_siblings()): s.decompose()
def only_after_sh(page, html):
    sec = soup.select_one(page + " section"); sh = sec.select_one(".sh"); after(sh)
    for s in list(sh.find_next_siblings()): s.decompose()
    sh.insert_after(new(html))

if soup.select_one(".note"): soup.select_one(".note").decompose()
soup.title.string = "Poggio Winter Cup"
SOON = '<div class="card"><p class="mut">Sezione in arrivo.</p></div>'

# HOME: tengo hero, news, risultati, classifica e pulsanti; tolgo ciò che non è ancora collegato (niente dati finti)
for sec in list(soup.select("#home > section")):
    h = sec.select_one("h2"); t = h.get_text(strip=True) if h else ""
    if t == "In evidenza": sec.select_one(".grid").replace_with(new('<div class="grid" data-bind="home-news"></div>')); sec.select_one("h2").string = "News"
    elif t == "Risultati e prossime": sec.select_one(".grid").replace_with(new('<div class="grid" data-bind="results"></div>'))
    elif t == "Classifica": tb = sec.select_one("tbody"); tb.clear(); tb["data-bind"] = "standings"
    elif t == "Match Day":
        sh = sec.select_one(".sh"); after(sh); sh.insert_after(new('<div data-bind="matchday"></div>'))
    elif t == "Man of the Week":
        sec.select_one(".sh h2").string = "Man e Team of the Week"; sh = sec.select_one(".sh"); after(sh); sh.insert_after(new('<div data-bind="motw"></div>'))
    elif t == "Top 7 della settimana":
        sh = sec.select_one(".sh"); after(sh); sh.insert_after(new('<div data-bind="top7-mini"></div>'))
    elif t: sec.decompose()
# CLASSIFICA
tb = soup.select_one("#class tbody"); tb.clear(); tb["data-bind"] = "standings"
# CALENDARIO
soup.select_one("#cal .grid").replace_with(new('<div class="grid" data-bind="calendar"></div>'))
# SQUADRE
only_after_sh("#sq", '<div data-bind="teams"></div>')
# MARCATORI / STATISTICHE
v1 = soup.select_one("#stat .v1"); tb = v1.select_one("tbody"); tb.clear(); tb["data-bind"] = "scorers"
for el in list(v1.select_one(".tw").find_next_siblings()): el.decompose()
v1.append(new('<div data-bind="motw-history"></div>'))
v2 = soup.select_one("#stat .v2"); v2.clear(); v2.append(new('<div data-bind="teamstats"></div>'))
# NEWS (pagina): tutte le notizie pubblicate, articolo intero
only_after_sh("#news", '<div data-bind="news"></div>')
# REGOLAMENTO: PDF caricato dall'admin
sec = soup.select_one("#rg section"); back = sec.select_one("label.btn"); after(back); back.insert_after(new('<div data-bind="regulation"></div>'))
# SEZIONI NON ANCORA COLLEGATE
only_after_sh("#top", '<div data-bind="top7"></div>')
only_after_sh("#prem", '<div data-bind="awards"></div>')
only_after_sh("#tab", '<div data-bind="knockout"></div>')
sec = soup.select_one("#ed section"); back = sec.select_one("label.btn"); after(back); back.insert_after(new('<div data-bind="archive"></div>'))
adm = soup.select_one("#adm"); adm.clear()
adm.append(new('<section><div class="sh"><h2>Area riservata</h2><span></span></div>'
  '<div id="adm-login" class="lgbox card"><h3 class="mt1">Accesso admin</h3><p class="mut">Solo per gli amministratori.</p>'
  '<form id="adm-form"><input id="adm-user" type="text" placeholder="Username" autocomplete="username" required><input id="adm-pass" type="password" placeholder="Password" autocomplete="current-password" required>'
  '<p id="adm-msg" class="mut" role="alert"></p><button id="adm-go" class="btn" type="submit">Accedi</button></form><p class="mut" style="font-size:12px;margin-top:14px">versione 3i</p></div>'
  '<div id="adm-panel" hidden><p class="mut" style="margin:0 0 10px">Collegato come admin · <button id="adm-out" class="btn o s" type="button">Esci</button></p><p id="adm-toast" role="status" style="min-height:1.4em;margin:0 0 8px"></p><div id="adm-app"></div></div></section>'))
# DETTAGLIO PARTITA (pagina nuova, stesso stile)
last = soup.select_one("#t-rg"); last.insert_after(new('<input class="r" type="radio" name="pg" id="t-md">'))
soup.select_one("#rg").insert_after(new('<div class="pg" id="md"><section><div class="sh"><h2>Partita</h2><span></span></div><label class="btn o" for="t-cal">← Calendario</label><div data-bind="matchdetail"></div></section></div>'))

for sm in soup.select("footer small"):
    if "anteprima" in sm.get_text(): sm.string = "Poggio Winter Cup"
style = soup.new_tag("style"); style.string = ".apanel input[type=text],.apanel input[type=number],.apanel textarea,.apanel select{width:100%;padding:12px;margin:4px 0 10px;border-radius:10px;border:1px solid var(--line);background:var(--navy);color:#fff;font:inherit}.apanel input[type=color]{width:64px;height:42px;margin:4px 0 10px;background:none;border:0}.apanel input[type=file]{margin:4px 0 12px;max-width:100%}.apanel form .btn{margin-top:6px}.side label.on{background:var(--cyan);color:var(--navy)}.apanel .row summary .cr{flex:none}.apanel .kpi{font-size:44px}.apanel label{display:block;margin-top:6px}.apanel label.inl{display:inline-flex;align-items:center;gap:6px;margin:6px 0}.apanel .scorer{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-top:1px solid #2ec5ff22}.apanel .scorer select{flex:1 1 160px;margin:0}.apanel .scorer input[type=number]{width:76px;margin:0}.apanel input[type=datetime-local],.apanel input[type=date]{width:100%;padding:12px;margin:4px 0 10px;border-radius:10px;border:1px solid var(--line);background:var(--navy);color:#fff;font:inherit}.apanel input[type=checkbox]{width:20px;height:20px;margin:0}.apanel input[type=color]{display:block}.apanel input[type=file]{display:block}.seg label.on{background:var(--cyan);color:var(--navy)}.ros>div{display:none}.ros>div.on{display:block}.pf{background-size:cover;background-position:center}[hidden]{display:none!important}#t-md:checked~main #md{display:block}.mr[data-match]:hover{background:#1f3df022;border-radius:10px}"
soup.head.append(style)
for s in ("config.js", "convex-browser.bundle.js", "render.js", "admin-session.js", "admin.js", "app.js"):
    t = soup.new_tag("script", src="js/" + s); soup.body.append(t)
open(dst, "w", encoding="utf-8").write(str(soup))
print("ok", len(str(soup)))
