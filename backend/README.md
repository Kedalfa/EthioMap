# Ethio-Map Backend Database & API Service

This is the backend service for the Ethio-Map GIS platform. It provides a Node.js/Express API connected to a PostgreSQL database with PostGIS enabled, serving administrative boundaries, cities, and transport corridors dynamically as GeoJSON FeatureCollections.

---

## Prerequisites

1. **Node.js** (v18 or higher recommended)
2. **PostgreSQL** (v12 or higher recommended) with **PostGIS** extension.

---

## Installation & Setup

### 1. Install PostgreSQL + PostGIS

#### Windows:
1. Download and run the standard PostgreSQL graphical installer from [EnterpriseDB](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
2. At the end of the installation wizard, launch **Stack Builder**.
3. Under the **Spatial Extensions** category, select and install the **PostGIS** bundle.
4. (Optional) Alternatively, if using Chocolatey, run:
   ```bash
   choco install postgresql postgis
   ```

#### macOS:
Install via Homebrew:
```bash
brew install postgresql postgis
```

#### Linux (Ubuntu/Debian):
Install postgresql and postgis via apt:
```bash
sudo apt update
sudo apt install postgresql postgresql-postgis
```

---

### 2. Create the Database

Log in to your PostgreSQL CLI (`psql`) or open pgAdmin, and create a database named `ethio_map`:
```sql
CREATE DATABASE ethio_map;
```

---

### 3. Configure the Environment

1. Navigate to the `backend` directory.
2. Copy `.env.example` to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and configure your credentials. The default is:
   ```env
   PORT=4000
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ethio_map
   ```
   *Replace username (`postgres`), password (`postgres`), host, and database name as per your local installation.*

---

### 4. Install Dependencies

Install Node packages:
```bash
npm install
```

---

### 5. Build and set up the database

Build the backend and initialize the PostGIS tables:
```bash
npm run build
npm run db:setup
```
This applies `../database/schema.sql`, which enables PostGIS, creates the dataset, user, and activity-log tables, and adds spatial indexes. If `database/seed.sql` is present, it is applied automatically; otherwise the step completes without seed data.

---

## Running the Server

### Development Mode (with hot-reloading)
Start the Express server in development mode:
```bash
npm run dev
```
The server will start on `http://localhost:4000`. 

You can check API connectivity by visiting the health endpoint in your browser or curl:
- Health status: `GET http://localhost:4000/api/health`
- Regions layer: `GET http://localhost:4000/api/layers/regions`
- Cities layer: `GET http://localhost:4000/api/layers/cities`
- Corridors layer: `GET http://localhost:4000/api/layers/corridors`

### Production Mode
Build TypeScript into JavaScript and run:
```bash
npm run build
npm start
```
