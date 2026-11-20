# ZdrowieDietaSport

Rodzinna aplikacja PWA do prowadzenia diety (3 osoby, nacisk na dziecko 10 lat). Działa offline, bez instalowania pakietów i bez frameworka.

## Co jest w wersji 0.1

- **Dziś**: 5 posiłków (7:00, 10:30, 14:00, 17:30, 20:30), licznik wody (cel 2 l = 8 szklanek), kalorie względem celu.
- **Sprawdź**: wyszukiwarka „czy mogę to zjeść?" z regułami z zaleceń dietetyka (dozwolone, w ograniczonych ilościach, zakazane).
- **Profile**: Franciszek (dziecko, cel 1750 kcal) i dwie osoby dorosłe, można dodawać i edytować.
- **Widok dziecka**: bez kalorii i wagi, pozytywne komunikaty. Pełny widok po włączeniu trybu rodzica (PIN to zasłona widoku, nie zabezpieczenie danych).
- **Offline**: Service Worker, dane w `localStorage` na urządzeniu.

## Uruchomienie

```
python3 -m http.server 8080
```

Potem otwórz `http://localhost:8080`.

## Struktura

- `index.html`, `styles.css`, `app.js`: aplikacja
- `data/rules.json`: zasady z dokumentu LUX MED z 19.11.2026
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA

## Plan

1. Synchronizacja rodziny (konto, kod zaproszenia, role).
2. Kuchnia: przepisy dla Thermomixa TM6 i air fryera sprawdzane z regułami.
3. Skaner kodów kreskowych (Open Food Facts) i raport PDF na wizytę kontrolną.

Uwagi o Thermomixie i air fryerze to propozycje do potwierdzenia z dietetykiem. Aplikacja nie zastępuje porady dietetyka.
