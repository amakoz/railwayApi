# System Kolejek Górskich API

System Kolejek Górskich to API zarządzające kolejkami górskimi oraz przypisanymi do nich wagonami. System umożliwia monitorowanie i weryfikację, czy kolejki górskie posiadają wystarczającą ilość wagonów i personelu dla określonej ilości klientów.

## Spis treści

1. [Opis systemu](#opis-systemu)
2. [Funkcje](#funkcje)
3. [Wymagania](#wymagania)
4. [Instalacja i uruchomienie](#instalacja-i-uruchomienie)
5. [Opis API](#opis-api)
6. [Przykłady użycia (cURL)](#przykłady-użycia-curl)
7. [Konfiguracja środowiska](#konfiguracja-środowiska)
8. [System rozproszony](#system-rozproszony)
9. [Zmienne w API](#zmienne-w-api)

## Opis systemu

System zarządza kolejkami górskimi oraz przypisanymi do nich wagonami. Główne funkcje systemu to:

- Rejestracja i zarządzanie kolejkami górskimi
- Rejestracja i zarządzanie wagonami
- Kalkulacja wymaganej liczby personelu
- Kalkulacja możliwości obsługi klientów
- Monitorowanie i raportowanie statusu kolejek
- Działanie w trybie rozproszonym dzięki integracji z Redis

System działa w dwóch trybach:
- **Tryb deweloperski** - nasłuchuje na porcie 3050, wyświetla wszystkie logi
- **Tryb produkcyjny** - nasłuchuje na porcie 3051, wyświetla tylko logi warn i error

## Funkcje

### Zarządzanie kolejkami górskimi
- Dodawanie nowych kolejek górskich
- Aktualizacja danych istniejących kolejek
- Pobieranie informacji o kolejkach górskich

### Zarządzanie wagonami
- Dodawanie wagonów do kolejek górskich
- Usuwanie wagonów z kolejek górskich
- Pobieranie informacji o wagonach

### Monitorowanie
- Obliczanie wymaganej liczby personelu
- Obliczanie możliwości obsługi klientów
- Wyświetlanie statystyk w czasie rzeczywistym
- Wykrywanie problemów z obsadzeniem personelu i liczbą wagonów

### System rozproszony
- Automatyczny wybór węzła głównego (master)
- Synchronizacja danych między węzłami
- Autonomiczne działanie węzłów gdy nie są podłączone do sieci

## Wymagania

- Node.js (zalecana wersja 18+)
- Yarn (lub npm)
- Docker i Docker Compose
- Instancja Redis (na lokalnej maszynie lub zewnętrznym serwerze)

## Instalacja i uruchomienie

### Konfiguracja lokalna

1. Sklonuj repozytorium
2. Zainstaluj zależności:
```bash
yarn install
```
3. Uruchom aplikację w trybie deweloperskim:
```bash
yarn dev
```
4. Lub w trybie produkcyjnym:
```bash
yarn build
yarn prod
```

### Uruchomienie z Docker Compose

#### Tryb deweloperski
```bash
docker-compose up dev
```

#### Tryb produkcyjny
```bash
docker-compose up prod
```

#### Uruchomienie obu trybów jednocześnie
```bash
docker-compose up
```

#### Zatrzymanie kontenerów
```bash
docker-compose down
```

## Opis API

### Rejestracja nowej kolejki górskiej
- **Endpoint**: `POST /api/coasters`
- **Opis**: Dodaje nową kolejkę górską do systemu
- **Dane wejściowe**:
  ```json
  {
    "staffCount": 16,
    "clientCount": 60000,
    "trackLength": 1800,
    "hoursFrom": "8:00",
    "hoursTo": "16:00"
  }
  ```

### Aktualizacja kolejki górskiej
- **Endpoint**: `PUT /api/coasters/:coasterId`
- **Opis**: Aktualizuje dane istniejącej kolejki górskiej
- **Dane wejściowe**:
  ```json
  {
    "staffCount": 20,
    "clientCount": 70000,
    "hoursFrom": "9:00",
    "hoursTo": "17:00"
  }
  ```
- **Uwaga**: Długość trasy (`trackLength`) nie może być zmieniona

### Pobieranie wszystkich kolejek górskich
- **Endpoint**: `GET /api/coasters`
- **Opis**: Zwraca listę wszystkich kolejek górskich

### Pobieranie pojedynczej kolejki górskiej
- **Endpoint**: `GET /api/coasters/:coasterId`
- **Opis**: Zwraca dane pojedynczej kolejki górskiej i jej status

### Rejestracja nowego wagonu
- **Endpoint**: `POST /api/coasters/:coasterId/wagons`
- **Opis**: Dodaje nowy wagon do określonej kolejki górskiej
- **Dane wejściowe**:
  ```json
  {
    "seatCount": 32,
    "wagonSpeed": 1.2
  }
  ```

### Usunięcie wagonu
- **Endpoint**: `DELETE /api/coasters/:coasterId/wagons/:wagonId`
- **Opis**: Usuwa wybrany wagon z danej kolejki górskiej

### Pobieranie wagonów dla kolejki
- **Endpoint**: `GET /api/coasters/:coasterId/wagons`
- **Opis**: Zwraca listę wszystkich wagonów dla danej kolejki górskiej

## Przykłady użycia (cURL)

### Dodanie nowej kolejki górskiej
```bash
curl -X POST http://localhost:3050/api/coasters \
  -H "Content-Type: application/json" \
  -d '{
    "staffCount": 16,
    "clientCount": 60000,
    "trackLength": 1800,
    "hoursFrom": "8:00",
    "hoursTo": "16:00"
  }'
```

### Aktualizacja kolejki górskiej
```bash
curl -X PUT http://localhost:3050/api/coasters/{coasterId} \
  -H "Content-Type: application/json" \
  -d '{
    "staffCount": 20,
    "clientCount": 70000,
    "hoursFrom": "9:00",
    "hoursTo": "17:00"
  }'
```

### Pobieranie wszystkich kolejek
```bash
curl -X GET http://localhost:3050/api/coasters
```

### Pobieranie pojedynczej kolejki
```bash
curl -X GET http://localhost:3050/api/coasters/{coasterId}
```

### Dodanie nowego wagonu
```bash
curl -X POST http://localhost:3050/api/coasters/{coasterId}/wagons \
  -H "Content-Type: application/json" \
  -d '{
    "seatCount": 32,
    "wagonSpeed": 1.2
  }'
```

### Usunięcie wagonu
```bash
curl -X DELETE http://localhost:3050/api/coasters/{coasterId}/wagons/{wagonId}
```

### Pobieranie wagonów dla kolejki
```bash
curl -X GET http://localhost:3050/api/coasters/{coasterId}/wagons
```

## Konfiguracja środowiska

System wykorzystuje plik `.env` do konfiguracji. Przykładowa zawartość:

```
NODE_ENV=development
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Zmienne środowiskowe

| Zmienna      | Opis                              | Wartość domyślna |
|--------------|-----------------------------------|------------------|
| NODE_ENV     | Środowisko (development/production)| development      |
| REDIS_HOST   | Host Redis                        | localhost        |
| REDIS_PORT   | Port Redis                        | 6379             |

## System rozproszony

System może działać w trybie rozproszonym, gdzie każda kolejka górska działa autonomicznie. Gdy więcej niż jedna kolejka jest podłączona do sieci, jeden z systemów przejmuje rolę centralnego węzła, zarządzającego wszystkimi kolejkami.

### Funkcje systemu rozproszonego

- Automatyczne wybieranie węzła głównego (master)
- Synchronizacja danych między węzłami
- Obsługa awarii i ponownego dołączania węzłów
- Możliwość autonomicznej pracy węzłów

### Zasady działania

1. Każdy węzeł może działać niezależnie, nawet bez połączenia z siecią
2. Po podłączeniu do sieci, węzły automatycznie wybierają master node
3. Master node koordynuje synchronizację danych między wszystkimi węzłami
4. W przypadku awarii master node, automatycznie wybierany jest nowy
5. Synchronizacja danych między węzłami działa asynchronicznie

## Zarządzanie personelem i klientami

### Zarządzanie personelem
- Do obsługi każdej kolejki górskiej wymagany jest 1 pracownik
- Do obsługi każdego wagonu dodatkowo wymagane są 2 osoby
- System informuje o brakach lub nadmiarze personelu

### Zarządzanie klientami
- System monitoruje liczbę klientów, których kolejka powinna obsłużyć w ciągu dnia
- Jeśli kolejka nie będzie w stanie obsłużyć wszystkich klientów, system informuje o brakach
- Jeśli kolejka ma możliwość obsłużenia ponad dwukrotnie większej liczby klientów, system informuje o nadmiarze zasobów

## Zmienne w API

System używa angielskich nazw zmiennych w kodzie i API, ale zachowuje polskie komunikaty w logach i interfejsie użytkownika. Poniżej znajduje się mapowanie pomiędzy polskimi i angielskimi nazwami zmiennych:

### Kolejki górskie (Coaster)

| Polski          | Angielski     | Opis                                 |
|-----------------|---------------|------------------------------------- |
| liczba_personelu| staffCount    | Liczba osób personelu przypisana do kolejki |
| liczba_klientow | clientCount   | Liczba klientów dziennie do obsłużenia |
| dl_trasy        | trackLength   | Długość trasy kolejki w metrach     |
| godziny_od      | hoursFrom     | Godzina rozpoczęcia pracy kolejki (format "HH:MM") |
| godziny_do      | hoursTo       | Godzina zakończenia pracy kolejki (format "HH:MM") |

### Wagony (Wagon)

| Polski          | Angielski     | Opis                                 |
|-----------------|---------------|------------------------------------- |
| ilosc_miejsc    | seatCount     | Liczba miejsc dostępnych w wagonie   |
| predkosc_wagonu | wagonSpeed    | Prędkość wagonu w metrach na sekundę |

Wszystkie zapytania do API muszą używać angielskich nazw zmiennych. System wewnętrznie używa angielskich nazw, ale wyświetla komunikaty w języku polskim.
