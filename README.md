# Edana Schools — School Management System

A complete school portal for primary and secondary schools (Reception 1 to SS 3),
powered by React + Supabase.

## Features

- **Roles:** Super Admin, Admin, Teacher, Part-Time Staff, Bursary, Parent — each with its own dashboard and access level
- **Students:** admission, bulk CSV upload, promotion, parent linking
- **Results:** Test (40) + Exam (60) entry by subject or by student, automatic totals/grades, printable terminal report cards (1st–3rd term, traits, comments, class position)
- **Attendance:** daily class marking; parents view their children's attendance
- **Fees (Bursary):** fee bills, sending fee details to parents, Paystack card payments, bank-transfer receipt upload (PDF/image) with bursary verification
- **Notice board, classes, subjects, part-time staff subject assignments**

## Getting started (development)

```bash
npm install
npm run dev
```

## Database (one-time)

In the Supabase dashboard → **SQL Editor**, run the contents of
[`supabase-setup.sql`](supabase-setup.sql). It is safe to re-run — it only adds
what is missing and never deletes data.

## Publishing (GitHub + Vercel)

1. Create a new repository on GitHub (e.g. `edana-schools`).
2. Push this project:

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/edana-schools.git
   git branch -M main
   git push -u origin main
   ```

3. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
   Vercel detects **Vite** automatically (build: `npm run build`, output: `dist`). Click **Deploy**.
4. Your link looks like: `https://edana-schools.vercel.app`
5. In Supabase → **Authentication → URL Configuration**, add your Vercel link as
   the **Site URL** and under **Redirect URLs** (`https://edana-schools.vercel.app/**`)
   so password-reset emails work.

Every future `git push` redeploys automatically.

## Standalone login page

`login.html` (also published at `/login.html`) is a dependency-free HTML/CSS/JS
version of the login page that signs in against the same Supabase project and
forwards users into the portal.
