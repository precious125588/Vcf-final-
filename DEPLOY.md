# Deployment Guide

## Railway (Recommended)
1. Push to GitHub
2. Go to railway.app → New Project → Deploy from GitHub repo
3. Click + New → Database → Add PostgreSQL
4. Railway sets DATABASE_URL automatically — done!

## Vercel
1. Push to GitHub
2. Import on vercel.com
3. Project Settings → Environment Variables → add DATABASE_URL
   (Get free Postgres from neon.tech — takes 2 mins)
4. Deploy!

## Local
cp .env.example .env   # fill in DATABASE_URL
npm install
node server.js
