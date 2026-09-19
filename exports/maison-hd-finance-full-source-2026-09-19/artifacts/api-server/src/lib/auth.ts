import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
  throw new Error("JWT_SECRET or SESSION_SECRET must be configured with at least 32 bytes");
}
const jwtSecret: string = JWT_SECRET;

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  organizationId: number | null;
  propertyId: number | null;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: 7 * 24 * 60 * 60 });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, jwtSecret) as unknown as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "Missing token" });
    return;
  }
  const token = authHeader.substring(7);
  try {
    const payload = verifyToken(token);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
