# Staz — Gestione Scommesse Calcio

Applicazione web per la gestione di scommesse calcistiche con calcolo automatico dello stake in base a regole configurabili.

## Stack

- **Frontend**: Angular 19 + Angular Material
- **Backend**: NestJS + TypeORM
- **Database**: PostgreSQL (Docker)

## Deploy produzione (Docker / VPS OVH)

Vedi **[DEPLOY.md](./DEPLOY.md)** per la guida completa con Docker Compose, HTTPS e GitHub Actions.

```bash
cp .env.production.example .env.production   # configura password e JWT
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Avvio rapido (sviluppo locale)

### 1. Database

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # se necessario
npm install
npm run start:dev
```

API disponibile su `http://localhost:3000`.

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

App disponibile su `http://localhost:4200`.

## Funzionalità

- Setup capitale iniziale
- Calcolo stake automatico in base alla quota e al capitale attuale
- Registrazione scommesse e gestione esiti (vinta/persa)
- Storico con filtri e delta capitale
- Configurazione regole di stake (range quota → percentuale)

## Esempio

Capitale 500€, quota 1.75 → range 1.00–2.00 → stake 10% → **50€** da giocare.

- **Vinta**: capitale += importo × (quota − 1)
- **Persa**: capitale −= importo giocato

## API principali

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/capital` | Capitale attuale |
| POST | `/capital` | Imposta capitale |
| GET | `/staking-rules` | Regole stake |
| POST | `/bets/calculate-stake` | Anteprima stake |
| POST | `/bets` | Nuova scommessa |
| PATCH | `/bets/:id/settle` | Regola esito |
| GET | `/bets` | Storico |
