Maknazul Irfan LMS API

Backend API for Maknazul Irfan Online Islamic & Arabic Institute LMS.

The API provides the server-side foundation for authentication, academic management, student management, examinations, results, and other LMS services.

Project

Name: Maknazul Irfan Online Islamic & Arabic Institute
Service: LMS API
Version: 1.0.0

Technology Stack

- Node.js
- TypeScript
- Express.js
- Prisma ORM
- PostgreSQL
- Zod
- Argon2
- Helmet
- CORS
- Cookie Parser
- Express Rate Limit

Directory Structure

api/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── server.ts
├── package.json
├── tsconfig.json
└── README.md

Installation

From the API directory:

npm install

Development

Start the development server:

npm run dev

Type Checking

npm run typecheck

Build

npm run build

Production Start

npm start

Prisma

Generate the Prisma client:

npm run prisma:generate

Run database migrations:

npm run prisma:migrate

Seed the database:

npm run prisma:seed

Environment Variables

Create a ".env" file in the appropriate API project directory.

Example:

PORT=6700
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
JWT_SECRET="change-this-secret"
NODE_ENV="development"

Never commit real passwords, API keys, database credentials, or production secrets to Git.

API

The API is designed to serve the Maknazul Irfan LMS frontend and other authorized clients.

The development server uses:

http://localhost:6700

Health Check

The API includes a health endpoint for checking whether the server is running.

Expected service information:

{
  "status": "ok",
  "service": "Maknazul Irfan LMS API"
}

Development Principle

The system is being developed as a production-oriented Learning Management System for Arabic and Islamic education.

Core areas include:

- Authentication and authorization
- Student management
- Teacher management
- Academic classes
- Courses and subjects
- Lessons
- Examinations
- Results and grading
- Student progress
- Attendance
- Administrative management
- Future payment integration
- Future live-class integration

License

This project is private and proprietary to Maknazul Irfan Online Islamic & Arabic Institute.