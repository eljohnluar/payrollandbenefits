# Payroll & Benefits Management System (HR4)
**TRI-M GLOBAL LOGISTICS & TRADING INC. (TGLTI)**

An enterprise-grade, semi-monthly payroll and benefits management platform engineered for Philippine statutory compliance, multi-system HR integration, and employee self-service.

---

## 🌟 Overview

The **Payroll & Benefits Management System (HR4)** serves as the financial and compensation core of the enterprise HRMS ecosystem. It ingests employee records from **HR1 (Core HR / Recruitment)**, attendance and leaves from **HR2 (Workforce Management)**, and performance ratings from **HR3 (Performance & Development)** to automate gross-to-net payroll runs, statutory deductions, and tax withholdings.

The platform is deployed as a unified single-container application on **HostForge** with a **Supabase PostgreSQL** cloud database.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React 18, Vite | Single Page Application (SPA), responsive sidebar layout, employee & admin portals |
| **Backend** | Laravel 11, PHP 8.3 | RESTful JSON API, session & JWT token authentication, audit logging |
| **Database** | Supabase (PostgreSQL 15+) | Managed PostgreSQL via transaction pooler with SSL encryption |
| **Email & 2FA** | Gmail SMTP (App Password) | Native 6-digit OTP verification & transactional registration confirmations |
| **OAuth** | Supabase Auth | Optional Google Workspace single sign-on |
| **OCR Service** | TabScanner API | Automated receipt scanning for employee reimbursement claims |
| **Deployment** | Docker on HostForge | Multi-stage build (Node 22 + PHP 8.3 Bookworm) served via single domain |

---

## 🚀 Key Features

### 1. Automated Payroll Engine
- **Semi-Monthly Cut-Offs:** Standard paydays on the 15th and month-end (never Sundays).
- **Philippine Statutory Compliance:** Automated computation of SSS, PhilHealth, Pag-IBIG, and BIR withholding tax.
- **Deductions & Additions:** Late tardiness deductions, unpaid leave deductions, overtime pay, night differential, and holiday pay.
- **Allowances & Incentives:** Fixed and recurring allowances, KPI-based performance incentives, and loan amortization deductions.

### 2. Dual User Portals
- **HR Admin Portal:** Comprehensive employee directory, payroll run processor, compensation adjustment, claims approval, statutory reporting, and audit trail.
- **Employee Self-Service (ESS):** Payslip viewing and PDF download, digital reimbursement claim filing with receipt scanning, and personal profile viewing.

### 3. Enterprise Integration Hub (HR1, HR2, HR3, Finance)
- **HR1 (Recruitment / Core HR):** Inbound employee master data synchronization (`POST /api/integration/employees`).
- **HR2 (Workforce Management):** Inbound daily attendance logs (`POST /api/integration/attendance`) and approved leave requests (`POST /api/integration/leave`).
- **HR3 (Performance & Development):** Inbound approved performance evaluation scores and ratings (`POST /api/integration/performance`).
- **Finance & Accounting:** Outbound payslip queries (`GET /api/integration/payslips/{code}`) and general ledger journal exports (`GET /api/integration/journal/{runId}`).

---

## 📂 Repository Structure

```
payrollandbenefitssystemv2/
├── frontend/                     # React Vite Single Page Application
│   ├── src/
│   │   ├── api/                  # API client & HTTP fetch wrappers
│   │   ├── auth/                 # AuthContext & session watchdog
│   │   ├── components/           # Reusable UI widgets & layouts
│   │   ├── pages/                # App pages (Dashboard, Payroll, Claims, Employees, etc.)
│   │   └── lib/                  # Utilities & Supabase client
│   └── vite.config.js            # Build configuration (/spa/ base in production)
│
├── laravel-backend/              # Laravel REST API Backend
│   ├── app/                      # Business logic, services & models
│   │   ├── Auth.php              # Authentication & token manager
│   │   ├── EmailOtpService.php   # Gmail SMTP OTP dispatcher
│   │   ├── PayrollService.php    # Gross-to-net computation engine
│   │   ├── IntegrationAuth.php   # Machine-to-machine API key gate
│   │   └── ...                   # Claims, incentives, settings services
│   ├── routes/
│   │   ├── api.php               # All REST endpoints under /api prefix
│   │   └── web.php               # SPA index.html & static asset catch-all
│   └── config/                   # Mail, database, and CORS configurations
│
├── Dockerfile                    # Multi-stage production container build
├── .dockerignore                 # Production build exclusion rules
├── ENDPOINT.md                   # Full REST API documentation & JSON contracts
├── FORHR1.md                     # HR1 integration specifications
├── FORHR2.md                     # HR2 integration specifications
├── FORHR3.md                     # HR3 integration specifications
└── SYSTEM_DESIGN.md              # System architecture & inter-module design
```

---

## ⚙️ Local Development Setup

### Prerequisites
- **PHP 8.2+** with extensions: `pdo_pgsql`, `openssl`, `mbstring`, `curl`
- **Composer 2.x**
- **Node.js 20+** and **npm**
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/payrollandbenefitssystemv2.git
cd payrollandbenefitssystemv2
```

### 2. Backend Setup
```bash
cd laravel-backend
composer install
cp .env.example .env
php artisan key:generate
```

Configure your `.env` with your database and email credentials:
```ini
DB_CONNECTION=pgsql
DB_HOST=aws-0-ap-south-1.pooler.supabase.com
DB_PORT=6543
DB_DATABASE=postgres
DB_USERNAME=postgres.dbtclnbadnhysvtudcmb
DB_PASSWORD=YourDatabasePassword
DB_SSLMODE=require

# App signing secret
APP_SECRET=your-32-character-secret
REGISTRATION_CODE=DEMO123

# Gmail SMTP OTP Configuration
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD="your-16-char-app-password"
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=your-email@gmail.com
MAIL_FROM_NAME="TGLTI - Payroll System"
```

Start the backend server on port 8080:
```bash
php artisan serve --port=8080
```

### 3. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm install
```

Ensure `frontend/.env.local` points to your local backend:
```ini
VITE_API_PROXY=http://127.0.0.1:8080
```

Start the Vite development server:
```bash
npm run dev
```

Visit `http://localhost:5173` to access the application.

---

## 🚢 Production Deployment (HostForge)

The system deploys as a single Docker container containing both the compiled React frontend and the Laravel backend.

### 1. Production Domains
- **Official Domain:** `https://payroll.mms-tmglt.com`
- **HostForge Platform URL:** `https://payrollandbenefits-tglti.hostforgeplatform.com`

### 2. Deployment Steps
1. Push your latest commits to the `main` branch on GitHub:
   ```bash
   git add .
   git commit -m "Deploy latest changes"
   git push
   ```
2. In the **HostForge Dashboard**, configure the environment variables as defined in `hostforge.env`.
3. HostForge automatically executes the `Dockerfile`:
   - Builds the React SPA with Node 22 (`npm run build`).
   - Copies the distribution files to `public/spa` inside the PHP container.
   - Serves API routes and SPA routes seamlessly through port 8080.
4. Verify deployment health at:
   ```http
   GET https://payroll.mms-tmglt.com/api/health
   ```

---

## 🔒 Security & Access Control

- **Role-Based Access Control (RBAC):** Dedicated permissions for `HR` (Admin) and `Employee`.
- **Two-Factor Authentication (2FA):** 6-digit email OTPs sent via Gmail SMTP for login verification.
- **API Key Scopes:** Machine-to-machine integrations are protected by cryptographically hashed API keys restricted to specific scopes (`core-hr:write`, `workforce:write`, `performance:write`, `finance:read`, `payroll:read`).
- **Session Protection:** Automatic session timeout after 5 minutes of inactivity (configurable in Settings).

---

## 👥 Inter-System Integrations Quick Reference

| System | Role | URL | Auth | Primary Ingested Data |
|---|---|---|---|---|
| **HR1** | Recruitment / Core HR | `https://recruitment.mms-tmglt.com` | `X-Api-Key` | Employee master, job titles, status |
| **HR2** | Workforce Management | `https://workforce.mms-tmglt.com` | `X-Api-Key` | Daily attendance, hours, tardiness, leaves |
| **HR3** | Performance & Development | `https://performance.mms-tmglt.com` | `X-Api-Key` | Performance evaluation scores, ratings |
| **HR4** | **Payroll & Benefits** | `https://payroll.mms-tmglt.com` | Bearer / API Key | **Gross-to-net salary computation** |

---

## 📄 License

Internal proprietary software for **TRI-M GLOBAL LOGISTICS & TRADING INC. (TGLTI)**. All rights reserved.
