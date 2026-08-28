# Deploy Staz su VPS OVH con Docker

Guida per pubblicare l'app partendo dal repository GitHub.

## Architettura

```
Internet :80
    └── frontend (Nginx)
            ├── /       → Angular (file statici)
            └── /api/*  → backend (NestJS :3000)
    postgres (solo rete interna Docker)
```

---

## 1. VPS OVH

1. Crea un VPS con **Ubuntu 24.04**.
2. Punta il dominio (record **A**) all'IP del VPS.
3. Collegati via SSH:

```bash
ssh root@TUO_IP
```

4. Installa Docker:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

5. (Consigliato) Crea utente deploy:

```bash
adduser deploy
usermod -aG docker deploy
su - deploy
```

---

## 2. Clona il repository

```bash
git clone https://github.com/TUO_USER/Staz.git
cd Staz
```

Per repo privati, configura una **Deploy Key** su GitHub.

---

## 3. Configura le variabili d'ambiente

```bash
cp .env.production.example .env.production
nano .env.production
```

Imposta almeno:

| Variabile | Descrizione |
|-----------|-------------|
| `DB_PASSWORD` | Password forte per PostgreSQL |
| `JWT_SECRET` | Stringa casuale lunga (es. `openssl rand -hex 32`) |
| `LEGACY_OWNER_PASSWORD` | Solo al **primo** deploy se devi migrare dati esistenti |

Dopo il primo avvio con dati migrati, svuota `LEGACY_OWNER_PASSWORD` nel file.

---

## 4. Avvia l'applicazione

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Oppure manualmente:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

L'app sarà raggiungibile su `http://TUO_IP` o `http://tuodominio.it`.

Verifica:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```

---

## 5. HTTPS (Let's Encrypt)

Con Docker in ascolto sulla porta 80, il modo più semplice è **Certbot in standalone** durante il rinnovo, oppure un reverse proxy sul host.

### Opzione A — Certbot sul host (consigliata)

1. Ferma temporaneamente il frontend:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop frontend
```

2. Ottieni il certificato:

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d tuodominio.it -d www.tuodominio.it
```

3. Monta i certificati nel container frontend. Aggiungi in `docker-compose.prod.yml` sotto `frontend`:

```yaml
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
    ports:
      - '443:443'
      - '80:80'
```

4. Estendi `frontend/nginx.conf` con un blocco `listen 443 ssl` (o chiedi assistenza per la config SSL).

### Opzione B — Solo HTTP dietro Cloudflare

Se usi Cloudflare con proxy attivo, puoi terminare HTTPS lato Cloudflare e lasciare HTTP sul VPS.

---

## 6. Aggiornamenti

Ad ogni modifica su GitHub, sul VPS:

```bash
cd ~/Staz
./scripts/deploy.sh
```

---

## 7. Deploy automatico con GitHub Actions (opzionale)

1. Sul VPS, genera una chiave SSH per GitHub Actions:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N ""
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
```

2. Aggiungi questi **secrets** nel repository GitHub (`Settings → Secrets`):

| Secret | Valore |
|--------|--------|
| `VPS_HOST` | IP o dominio del VPS |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Contenuto di `~/.ssh/github_actions` (privata) |

3. Il workflow `.github/workflows/deploy.yml` eseguirà `./scripts/deploy.sh` ad ogni push su `main`.

---

## Comandi utili

```bash
# Log in tempo reale
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f

# Riavvio solo backend
docker compose --env-file .env.production -f docker-compose.prod.yml restart backend

# Backup database
docker exec staz-postgres pg_dump -U staz staz > backup.sql

# Stop completo
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

---

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Note produzione

- **Non committare** `.env.production` (contiene password e JWT secret).
- In futuro conviene disattivare `synchronize: true` in TypeORM e usare migrazioni.
- I dati PostgreSQL persistono nel volume Docker `staz_pgdata`.
