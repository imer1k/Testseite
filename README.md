# Company Courses Dashboard

Ein responsives Dashboard für Aktienkurse mit Performance-Überblick, Sparklines und einem vereinfachten Forecast. Die Daten werden serverseitig per GitHub Action aktualisiert, damit keine CORS-Probleme im Browser entstehen.

## Features
- Moderne Kartenansicht mit Logo, Kurs, Performance (7/14/30 Tage) und Sparkline.
- Detail-Modal mit historischem Chart, Forecast (lineare Regression) und Unsicherheitsband.
- Suche, Sortierung und Zeitraum-Filter.
- Datenupdate über GitHub Actions.

## Lokal öffnen
Da es sich um eine statische Web-App handelt, reicht ein einfacher Static-Server:

```bash
# Beispiel mit VS Code Live Server
# 1) Repo öffnen
# 2) "Go Live" klicken
```

Alternativ mit Python:

```bash
python3 -m http.server 8000
```

Anschließend `http://localhost:8000` öffnen.

## GitHub Pages aktivieren
1. In den Repository Settings → **Pages**.
2. Source: **Deploy from a branch**, Branch: `main`, Folder: `/root`.
3. Speichern – nach wenigen Minuten ist die Seite verfügbar.

## Datenupdate (GitHub Action)
Die Daten werden täglich um 06:00 UTC aktualisiert oder manuell via `workflow_dispatch`.
Die Action führt `scripts/fetch_data.mjs` aus und schreibt JSON-Dateien nach `/data`.

Lokales Update:

```bash
node scripts/fetch_data.mjs
```

## Disclaimer
Der Forecast basiert auf einer simplen linearen Regression und dient ausschließlich Demo-Zwecken. **Keine Anlageberatung.**
