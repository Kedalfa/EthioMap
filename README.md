# Ethio-Map

Ethio-Map is a web-based  platform for mapping and sharing geographic information about Ethiopia.

The project includes:

- `backend/` – Server-side application and database connection
- `frontend/` – User interface and web pages
- `database/` – Database schema and SQL files

## Purpose

The system helps users contribute, manage, and view location-based information through an interactive web application.

## Run on a PostGIS-enabled computer

1. Install Node.js 18+ and PostgreSQL with the PostGIS extension.
2. Create an empty database named `ethiomap` (or choose another name and use it in `backend/.env`).
3. Copy `backend/.env.example` to `backend/.env`, then set the PostgreSQL password and a strong `JWT_SECRET`. Do not transfer your existing `.env` file to another computer.
4. Install packages and initialize the database:

   ```bash
   cd backend
   npm install
   npm run build
   npm run db:setup
   cd ..
   npm install
   ```

5. Start the full application:

   ```bash
   npm start
   ```

Open `http://localhost:5500`. The API runs at `http://localhost:4000`.

When transferring the project, copy the source folders and package files. Leave out `backend/node_modules`; run `npm install` on the PostGIS-enabled computer instead.
