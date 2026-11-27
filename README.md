# ZdrowieDietaSport

Rodzinna aplikacja PWA do prowadzenia diety (3 osoby, nacisk na dziecko 10 lat). Działa offline, bez instalowania pakietów i bez frameworka.

## Co jest w aplikacji

- **Dziś**: 5 posiłków (7:00, 10:30, 14:00, 17:30, 20:30), licznik wody (cel 2 l = 8 szklanek), kalorie względem celu.
- **Sprawdź**: wyszukiwarka „czy mogę to zjeść?" z regułami z zaleceń dietetyka (dozwolone, w ograniczonych ilościach, zakazane).
- **Przepisy**: 36 przepisów domowych: 20 dań, 10 przekąsek i 6 napojów (Thermomix TM6, air fryer, bez urządzeń) z oceną każdego składnika względem zaleceń dietetyka. Skalowanie porcji, własne przepisy (składniki rozpoznawane automatycznie), zapis do dziennika.
- **Inne napoje** (ekran Dziś): herbata owocowa, napary, słaby napar herbaty, świeży sok z wodą, kefir, maślanka. Kawa tylko dla profili dorosłych, nigdy w widoku dziecka. Napoje synchronizują się razem z dniem.
- **Wygląd**: pastelowy, miękki styl z „wypukłymi” kartami, wskaźniki w kształcie pigułek, pływający pasek zakładek.
- **Tryb gotowania**: krok po kroku, duże litery, ustawienia TM6 i air fryera, timery z wibracją i dźwiękiem, ekran zostaje włączony.
- **Plan i zakupy** (tylko tryb rodzica/dorosły): plan na 7 dni, ostrzeżenie o owocach po 16:00, lista zakupów z sumowaniem składników, grupowaniem po działach, „Mam w domu" i kopiowaniem listy.
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
- `recipes.js`: logika przepisów (ocena składników, porcje, lista zakupów)
- `kuchnia.js`: widoki przepisów, trybu gotowania, planu i zakupów
- `data/recipes.json`: wbudowane przepisy
- `data/napoje.json`: szybkie napoje do dziennika
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
node tests/recipes.test.js  # przepisy zgodne z zaleceniami, porcje, lista zakupów
```

Reguły dostępu (`supabase/tests/rls_test.sql`) uruchamia się na zwykłym Postgresie po `stub_supabase.sql` i `schema.sql`.

## Plan

1. Pomiary (Tanita) i raport PDF na wizytę kontrolną.
2. Synchronizacja planu, listy zakupów i własnych przepisów między telefonami (dziś zostają na urządzeniu; dziennik i profile już się synchronizują).
3. Import przepisów z linku, spiżarnia z terminami ważności, resztki na kolejne dni.
4. Skaner kodów kreskowych (Open Food Facts).

Air fryer jest dozwolony (potwierdzone przez użytkownika 20.11.2026). Ustawienia Thermomixa i air fryera w przepisach są orientacyjne, dopasuj je do instrukcji swoich urządzeń. Sól i pieprz są w zaleceniach „w ograniczonych ilościach", dlatego oznaczone jako drobne i nie obniżają oceny całego przepisu. Aplikacja nie zastępuje porady dietetyka.

## Plan, aktywności i panel Sprawdź

- Plan: widok tygodnia i miesiąca (weekendy w innym odcieniu, etykieta dnia z datą), własne dania z kcal, „Dodaj do planu” na górze przepisu.
- Dziś: aktywność z czasem (synchronizowana razem z dniem).
- Sprawdź: trzy przewijane kolumny (można / z ograniczeniami / nie można).
- Tryb rodzica jest teraz w zakładce Profile.

## Wpisy syna, statystyki, przepisy z kurczakiem

- Syn dopisuje dania (okrągły plusik przy posiłku) i napoje; jego wpisy są fioletowe i od razu ocenione według zaleceń.
- Profile: wybór profilu, tryb rodzica, statystyki (kalorie, ciągłość, woda, aktywność, jakość) i eksport do arkusza CSV (udostępnianie albo e-mail z podsumowaniem).
- Zakładka Przepisy widoczna tylko w trybie rodzica. W bazie 122 przepisy, w tym 31 dań z kurczakiem i 33 z rybą.

## Logowanie (e-mail i hasło)

Aplikacja z ekranu początkowego iPhone'a ma osobną pamięć od Safari, więc link z maila jej nie zaloguje. Logujemy się e-mailem i hasłem. Przy pierwszym razie Supabase może wysłać mail z potwierdzeniem: wystarczy kliknąć link raz (w dowolnej przeglądarce), a potem zalogować się hasłem. Potwierdzanie można wyłączyć: Authentication → Sign In / Providers → Email → „Confirm email”.

## Raport, dźwięk, motyw

- Profile → Statystyki → „Przygotuj raport (Excel)”, potem „Wyślij raport”. Skoroszyt ma zakładki: Podsumowanie (formuły przeliczają się po dopisaniu kalorii), Posiłki (żółta kolumna do uzupełnienia kcal), Zdjęcia, Napoje, Aktywność (spalone kcal = MET × waga × czas).
- Pasek do następnego posiłku ma dźwięk pory posiłku: pik, pyk albo wyciszony (gra tylko, gdy aplikacja jest otwarta).
- Profile → Wygląd: jasny, ciemny albo jak w systemie.
- Usuwanie dań, propozycji, napojów, aktywności i zdjęć wymaga potwierdzenia.

## Wspólny plan, przepisy i zakupy

Plan, własne przepisy, lista zakupów, spiżarnia oraz zdrobnienia i waga w profilach synchronizują się w całej rodzinie (tabela `family_data`). Zmiany z kilku telefonów łączą się pozycja po pozycji. W istniejącym projekcie Supabase trzeba raz uruchomić `supabase/migracja-2-wspolne-dane.sql`.

## Monetki motywacyjne

Za każdy dzień spełniający zasady dziecko dostaje monetę (domyślnie 2 zł; bonus za pełny tydzień 5 zł). Na stronie Dziś między kapsułkami Woda i Posiłki jest „fiolka” z 7 monetami tygodnia, a pod nią karta „Dzisiejsza moneta” z brakującymi krokami. Rodzic w Ustawieniach widzi licznik do wypłaty, ustawia kwoty i warunki (posiłki, woda, nic zakazanego, ruch, zdjęcie) i zeruje licznik po wypłacie. Ustawienia synchronizują się w rodzinie.

## Kopia zapasowa (Ustawienia → Kopia zapasowa, tryb rodzica)

- **Pobierz kopię do pliku** – plik `zdrowie-dieta-kopia-RRRR-MM-DD-GGMM.json` z całym stanem aplikacji (profile, dni z posiłkami/wodą/napojami/ruchem/zdjęciami, plan, przepisy, zakupy, spiżarnia, monetki, ustawienia). Hasła do logowania w kopii nie ma.
- **Wgraj kopię z pliku** – pokazuje datę utworzenia i zawartość, przywraca dopiero po potwierdzeniu.
- **Zapisz kopię w bazie** – kopia w tabeli `family_backups` (Supabase), lista ostatnich 30 z datą; przywracanie i usuwanie (usuwa tylko rodzic). Wymaga jednorazowo `supabase/migracja-3-kopie-zapasowe.sql` – migracja tylko dodaje tabelę.
- Przed każdym przywróceniem aplikacja zapisuje kopię bezpieczeństwa obecnych danych (`zds.v1.przed-przywroceniem`) – przycisk **Cofnij przywrócenie**.
- Przywrócone dni i dane rodziny dostają nowy znacznik czasu, więc po synchronizacji wygrywają z bazą; wpisy, których w kopii nie ma, a są w bazie, zostają.

## Kalendarz w nagłówku i czat rodzinny

- **Data w nagłówku** (ekran Dziś) otwiera poglądowy kalendarz miesiąca: pierścień i kropki z liczbą zjedzonych posiłków, kropla za 2 l wody, monetka za dzień z nagrodą, podsumowanie miesiąca, przełączanie miesięcy.
- **Pastylka z dymkiem** obok synchronizacji to czat rodziny. U rodzica nowa wiadomość pokazuje czerwony **!**, u dziecka liczbę nowych wiadomości. Szybkie odpowiedzi dla dziecka i rodzica.
- Wiadomości synchronizują się razem ze wspólnymi danymi rodziny (`family_data`, klucz `prof`, wpisy `_m_<id>`), więc nie wymagają nowej migracji. Przy otwartym czacie odświeżanie co 8 s, poza nim co minutę. Na telefonie trzymamy ostatnie 200 wiadomości.

## Tryb rodzica

- Duży włącznik na samej górze Ustawień. Włączenie: PIN na klawiaturze numerycznej (kropki wyśrodkowane, C czyści, ⌫ kasuje cyfrę; działa też klawiatura fizyczna). Pierwsze włączenie ustawia 4-cyfrowy PIN wpisany dwa razy.
- Po włączeniu tryb zostaje włączony także po odświeżeniu i zamknięciu aplikacji (`localStorage` `zds.parent`, poza kopią i synchronizacją), dopóki rodzic sam go nie wyłączy tym samym włącznikiem.
