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
- `sync.js`, `config.js`: synchronizacja z Supabase
- `supabase/`: schemat bazy i testy reguł dostępu
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA

## Synchronizacja rodziny (Supabase)

Bez konfiguracji aplikacja działa lokalnie. Żeby włączyć synchronizację:

1. Załóż projekt na supabase.com, region UE (Frankfurt).
2. W SQL Editor wklej i uruchom `supabase/schema.sql` (tabele, reguły dostępu, funkcje).
3. Authentication → URL Configuration: wpisz adres, pod którym działa aplikacja (Site URL). Logowanie jest linkiem przez e-mail.
4. W `config.js` wpisz `SUPABASE_URL` i klucz `anon`. Klucza `service_role` nigdy nie wpisuj do aplikacji.
5. W aplikacji: Profile → Synchronizacja → e-mail → utwórz rodzinę (pierwszy rodzic) albo dołącz kodem.

Role: **rodzic** widzi całą rodzinę i pomiary, **dorosły** widzi tylko siebie, **dziecko** widzi tylko swój dziennik. Kod zaproszenia widzi tylko rodzic. Konflikty: nowszy zapis dnia wygrywa.

## Testy

```
node tests/sync.test.js     # scalanie profili i dni
```

Reguły dostępu (`supabase/tests/rls_test.sql`) uruchamia się na zwykłym Postgresie po `stub_supabase.sql` i `schema.sql`.

## Plan

1. Pomiary (Tanita) i raport PDF na wizytę kontrolną.
2. Kuchnia: przepisy dla Thermomixa TM6 i air fryera sprawdzane z regułami.
3. Skaner kodów kreskowych (Open Food Facts).

Uwagi o Thermomixie i air fryerze to propozycje do potwierdzenia z dietetykiem. Aplikacja nie zastępuje porady dietetyka.
