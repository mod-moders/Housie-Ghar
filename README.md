# Housie Ghar 🎲

**A full-stack web application that digitizes the traditional Indian game of Housie (Tambola/Indian Bingo).**

Built by **Mission for Operations & Development (MOD)** for the Darjeeling and Sikkim communities.

---

## Quick Start (Local Development)

### Prerequisites

| Software | Version | Purpose |
|---|---|---|
| Node.js | 20 LTS+ | Runs frontend & backend |
| npm | 10+ | Package management |
| Docker Desktop | Latest | Runs PostgreSQL & Redis |
| Docker Compose | v2.x | Orchestrates all services |
| Git | Any | Version control |

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd housie-ghar
   ```

2. **Create environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your JWT keys and configuration
   ```

3. **Start PostgreSQL and Redis:**
   ```bash
   docker compose up postgres redis -d
   ```

4. **Install dependencies:**
   ```bash
   cd backend && npm install && cd ..
   cd frontend && npm install && cd ..
   ```

5. **Run database migrations and seeds:**
   ```bash
   cd backend && npm run migrate && npm run seed && cd ..
   ```

6. **Start the backend:**
   ```bash
   cd backend && npm run dev
   ```

7. **Start the frontend (separate terminal):**
   ```bash
   cd frontend && npm run dev
   ```

8. **Access the platform:**
   - Player UI: `http://localhost:3000`
   - Admin Login: `http://localhost:3000/admin/login`

### LAN Access (Game Night)

1. Find your machine's local IP: `ifconfig` (Mac/Linux) or `ipconfig` (Windows)
2. Players on the same Wi-Fi connect to: `http://192.168.x.x`

---

## Architecture Overview

| Layer | Technology | Port |
|---|---|---|
| Frontend | Next.js (React) + Zustand + Tailwind CSS | 3000 |
| Backend | Node.js + Express.js + Socket.io | 4000 |
| Database | PostgreSQL 16 | 5432 |
| Cache/Pub-Sub | Redis 7 | 6379 |
| Reverse Proxy | Nginx | 80 |

## Key Features

- 🎲 **Cryptographically Fair Draw** — CSPRNG Fisher-Yates shuffle
- 🤖 **Fully Automated Game Engine** — zero manual intervention once started
- 💰 **P2P Payments** — WhatsApp + UPI, zero platform fees
- 🔐 **5-Tier RBAC** — Superadmin → Admin → Operator → Agent → Player
- ⚡ **Real-Time** — SSE for players, WebSockets for operators/agents
- 📱 **Mobile-First** — designed for smartphones

---

**Powered by Mission for Operations & Development (MOD)**
