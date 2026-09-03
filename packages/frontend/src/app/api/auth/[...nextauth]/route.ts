import { handlers } from "@/auth";

// Auth.js catch-all route: /api/auth/* (sign-in, callback, session, sign-out).
export const { GET, POST } = handlers;
