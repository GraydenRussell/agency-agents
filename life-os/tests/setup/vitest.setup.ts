import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/lifeos_test";
process.env.AUTH_MODE = "dev";
process.env.INTEGRATION_MODE = "mock";
process.env.ALLOWED_EMAIL = "grayden@example.com";
process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.CRON_SECRET = "test-cron-secret-0123456789";
