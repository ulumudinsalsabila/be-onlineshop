export type AuthUser = { id: string; email: string; name: string | null; role: "CUSTOMER" | "STAFF" | "ADMIN" };

export type AuthRequest = Request & { user?: AuthUser; cookies?: Record<string, string | undefined> };
