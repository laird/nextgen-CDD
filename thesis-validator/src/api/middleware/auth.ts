/**
 * Authentication Middleware
 *
 * JWT-based authentication for API access
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

/**
 * User payload in JWT token
 */
export interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'analyst' | 'viewer';
  permissions: string[];
}

/**
 * Authenticated request type
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: UserPayload;
}

/**
 * Register authentication plugin
 */
export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  // Register JWT plugin
  await fastify.register(import('@fastify/jwt'), {
    secret: process.env['JWT_SECRET'] ?? 'development-secret-change-in-production',
    sign: {
      expiresIn: '24h',
    },
  });

  // Add authenticate decorator
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth in development mode if DISABLE_AUTH is set
    if (process.env['NODE_ENV'] !== 'production' && process.env['DISABLE_AUTH'] === 'true') {
      // Set a default dev user when auth is disabled
      (request as AuthenticatedRequest).user = {
        id: 'dev-user',
        email: 'dev@localhost',
        name: 'Development User',
        role: 'admin',
        permissions: ['*']
      };
      return;
    }

    try {
      await request.jwtVerify();
    } catch (_err) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
}

/**
 * Authentication hook for protected routes
 */
export async function authHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth in development mode if DISABLE_AUTH is set
  if (process.env['NODE_ENV'] !== 'production' && process.env['DISABLE_AUTH'] === 'true') {
    // Set a default dev user when auth is disabled
    (request as AuthenticatedRequest).user = {
      id: 'dev-user',
      email: 'dev@localhost',
      name: 'Development User',
      role: 'admin',
      permissions: ['*']
    };
    return;
  }

  try {
    await request.jwtVerify();
  } catch (_err) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

/**
 * Role-based access control middleware
 */
export function requireRole(...allowedRoles: UserPayload['role'][]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;

    if (!user) {
      reply.status(401).send({ error: 'Unauthorized', message: 'No user context' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      reply.status(403).send({
        error: 'Forbidden',
        message: `Required role: ${allowedRoles.join(' or ')}`
      });
    }
  };
}

/**
 * Permission-based access control middleware
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;

    if (!user) {
      reply.status(401).send({ error: 'Unauthorized', message: 'No user context' });
      return;
    }

    const hasPermission = requiredPermissions.every(
      (perm) => user.permissions.includes(perm)
    );

    if (!hasPermission) {
      reply.status(403).send({
        error: 'Forbidden',
        message: `Missing permissions: ${requiredPermissions.join(', ')}`
      });
    }
  };
}

/**
 * Generate token for user
 */
export function generateToken(fastify: FastifyInstance, user: UserPayload): string {
  return fastify.jwt.sign(user);
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): UserPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString());
    return payload as UserPayload;
  } catch {
    return null;
  }
}
