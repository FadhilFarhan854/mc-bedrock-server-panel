# Bedrock Panel

Web admin panel untuk `itzg/minecraft-bedrock-server` Docker container.  
Dibangun dengan Next.js 16, React 19, Tailwind CSS, dan Dockerode.

## Fitur

- **Dashboard** — status server, player count, uptime, start/stop/restart
- **Console** — live log streaming (SSE) + kirim command
- **Properties** — edit `server.properties` langsung dari browser
- **Allow List** — tambah/hapus pemain whitelist
- **Backups** — buat, lihat, dan hapus backup world
- **Version** — info versi + trigger upgrade
- **Worlds & Packs** — upload `.mcworld`, `.mcpack`, `.mcaddon` ke container
- **Notifikasi** — toast + browser notification saat server mati/hidup
- **Mobile Responsive** — sidebar drawer untuk layar kecil

---

## Deploy dari Awal (Ubuntu 22)

### 1. Update sistem

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Verifikasi
docker --version
docker compose version
```

### 3. Install Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

node --version   # harus v24.x
npm --version
```

### 4. Install PM2

```bash
sudo npm install -g pm2
```

---

## Setup Minecraft Server

### 5. Buat folder dan jalankan container

```bash
mkdir -p ~/minecraft/data
cd ~/minecraft
```

Buat file `docker-compose.yml`:

```bash
cat > docker-compose.yml << 'EOF'
services:
  bds:
    image: itzg/minecraft-bedrock-server
    container_name: bds
    environment:
      EULA: "TRUE"
      VERSION: "LATEST"
      GAMEMODE: survival
      DIFFICULTY: normal
      SERVER_NAME: "My Bedrock Server"
      MAX_PLAYERS: "20"
    ports:
      - "19132:19132/udp"
    volumes:
      - ./data:/data
    tty: true
    stdin_open: true
    restart: unless-stopped
EOF
```

```bash
docker compose up -d

# Pantau log sampai server siap
docker logs -f bds
# Tunggu muncul: "Server started."
```

> **Jika download gagal (Mojang API error):** Tambahkan `SKIP_FETCH_LATEST: "true"` ke environment jika binary sudah pernah berhasil didownload sebelumnya. Atau tunggu hingga Mojang API pulih.

---

## Deploy Panel

### 6. Clone repo dari GitHub

```bash
cd ~
git clone https://github.com/USERNAME/NAMA-REPO.git panel
cd panel
```

### 7. Buat file `.env.local`

```bash
cp .env.local.example .env.local
nano .env.local
```

Isi dengan nilai berikut:

```env
# Nama container Minecraft (lihat: docker ps)
CONTAINER_NAME=bds

# Koneksi ke Docker (Linux pakai Unix socket)
DOCKER_SOCKET_PATH=/var/run/docker.sock

# Password login panel — ganti dengan password kuat!
PANEL_PASSWORD=passwordKuatKamu123!

# Secret untuk signing session token (string acak, minimal 32 karakter)
PANEL_SECRET=isi_random_string_panjang_disini_minimal_32_karakter

# Set 'true' HANYA jika panel diakses via HTTPS
# Jika pakai HTTP biasa (http://IP:3000), biarkan 'false'
SECURE_COOKIE=false
```

> **Penting:** Jangan pernah commit `.env.local` ke GitHub. File ini sudah ada di `.gitignore`.

### 8. Build dan jalankan panel

```bash
npm install
npm run build

# Jalankan dengan PM2
pm2 start npm --name "bedrock-panel" -- start
pm2 save

# Aktifkan auto-start saat server reboot
pm2 startup
# ← Jalankan perintah sudo yang muncul dari output di atas
```

Panel berjalan di: `http://IP-SERVER:3000`

### 9. Buka port di firewall

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 19132/udp   # port Minecraft
sudo ufw status
```

---

## Auto-Deploy via GitHub Actions

Setiap `git push` ke branch `main` akan otomatis deploy ulang ke server.

### Setup SSH key

Di komputer lokal:

```bash
ssh-keygen -t ed25519 -C "github-deploy-bedrock-panel"
# Simpan di lokasi default atau custom

# Copy public key ke server
ssh-copy-id ubuntu@IP-SERVER
```

### Tambah Secrets di GitHub

Buka repo GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Nilai |
|---|---|
| `SERVER_HOST` | IP server, contoh: `103.127.99.58` |
| `SERVER_USER` | username Linux, contoh: `ubuntu` |
| `SSH_PRIVATE_KEY` | isi file `~/.ssh/id_ed25519` (private key) |

### Buat workflow file

Buat file `.github/workflows/deploy.yml` di repo:

```yaml
name: Deploy Panel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy ke server via SSH
        uses: appleboy/ssh-action@v1
        with:
          host:     ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key:      ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ~/panel
            git pull origin main
            npm install --production=false
            npm run build
            pm2 restart bedrock-panel
```

---

## Pindah Server / Ganti VPS

Jika harus pindah ke server baru, ikuti langkah ini:

### 1. Backup data Minecraft dari server lama

```bash
# Di server lama
tar -czf ~/minecraft-backup.tar.gz ~/minecraft/data/
```

Download ke komputer lokal:

```bash
# Di komputer lokal
scp ubuntu@IP-LAMA:~/minecraft-backup.tar.gz .
```

### 2. Setup server baru

Ulangi **semua langkah dari awal** (langkah 1–9 di atas).

### 3. Restore data ke server baru

```bash
# Upload backup ke server baru
scp minecraft-backup.tar.gz ubuntu@IP-BARU:~/

# Di server baru
cd ~
tar -xzf minecraft-backup.tar.gz
# Data sudah ada di ~/minecraft/data/

docker compose up -d
```

### 4. Update GitHub Secrets

Ganti nilai `SERVER_HOST` di GitHub Secrets dengan IP server baru.

---

## Perintah Berguna

```bash
# Lihat status container
docker ps -a

# Lihat log Minecraft server (live)
docker logs -f bds

# Restart Minecraft server
docker compose restart

# Stop semua
docker compose down

# Lihat status panel
pm2 status

# Lihat log panel
pm2 logs bedrock-panel

# Restart panel
pm2 restart bedrock-panel

# Update panel secara manual
cd ~/panel && git pull && npm install && npm run build && pm2 restart bedrock-panel
```

---

## Troubleshooting

### Login panel tidak bisa masuk (tetap di halaman login)
Pastikan `SECURE_COOKIE=false` ada di `.env.local` jika menggunakan HTTP biasa (bukan HTTPS).

```bash
grep SECURE_COOKIE ~/panel/.env.local
# Harus menampilkan: SECURE_COOKIE=false
```

### Container restart terus (Mojang API error)
Mojang API sedang down. Solusi:

```bash
# Cek apakah binary sudah ada dari download sebelumnya
ls ~/minecraft/data/ | grep bedrock_server

# Jika ada, tambahkan SKIP_FETCH_LATEST ke docker-compose.yml
nano ~/minecraft/docker-compose.yml
# Tambah: SKIP_FETCH_LATEST: "true"

docker compose down && docker compose up -d
```

### Panel tidak bisa connect ke Docker (ENOENT / permission denied)
```bash
# Pastikan user ada di group docker
groups $USER | grep docker

# Jika tidak ada
sudo usermod -aG docker $USER
newgrp docker

# Restart panel
pm2 restart bedrock-panel
```

### Port 3000 tidak bisa diakses dari luar
```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

---

## Variabel Environment (`.env.local`)

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `PANEL_PASSWORD` | ✅ | — | Password login panel |
| `PANEL_SECRET` | — | sama dengan `PANEL_PASSWORD` | HMAC signing secret |
| `CONTAINER_NAME` | — | `bds` | Nama Docker container Minecraft |
| `DOCKER_SOCKET_PATH` | — | `/var/run/docker.sock` | Path Unix socket Docker |
| `DOCKER_HOST` | — | — | IP Docker daemon (jika TCP) |
| `DOCKER_PORT` | — | `2375` | Port Docker daemon (jika TCP) |
| `SECURE_COOKIE` | — | `false` | Set `true` hanya jika pakai HTTPS |
