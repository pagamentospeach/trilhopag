/**
 * Trilho Security Library — exports agrupados.
 *
 * Importe daqui pra ter acesso a todos os helpers:
 *
 * ```ts
 * import {
 *   safeFetch,           // SSRF-safe fetch
 *   safeRedirect,        // open redirect validation
 *   verifyWebhook,       // HMAC + replay protection
 *   withIdempotency,     // idempotency wrapper
 *   logAuditWithChain,   // tamper-proof audit log
 *   assertSafeOrigin,    // Server Action CSRF defense
 *   hashPassword,        // Argon2id
 *   verifyPassword,      // bcrypt + Argon2id detection
 * } from "@/lib/security";
 * ```
 */

export * from "./ssrf";
export * from "./redirect";
export * from "./webhook-verify";
export * from "./idempotency";
export * from "./audit-chain";
export * from "./origin";
export * from "./password";
export * from "./sanitize";
export * from "./rate-limit-db";
export * from "./error-response";
