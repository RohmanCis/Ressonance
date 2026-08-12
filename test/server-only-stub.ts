// Test-only stub for the `server-only` package. In production the real package
// errors when imported from a Client Component; in vitest (node environment)
// it would otherwise throw on import of server-only modules. This alias lets
// tests exercise the real DB/transaction/storage modules.
export {};