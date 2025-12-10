/**
 * Access Control Middleware
 *
 * Engagement-level access control ensuring users can only access authorized engagements
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from './auth.js';

/**
 * Engagement access record
 */
interface EngagementAccess {
  engagementId: string;
  userId: string;
  accessLevel: 'owner' | 'editor' | 'viewer';
  grantedAt: number;
  grantedBy: string;
}

/**
 * In-memory access store (replace with database in production)
 */
const accessStore = new Map<string, EngagementAccess[]>();

/**
 * Check if user has access to engagement
 */
export function hasEngagementAccess(
  userId: string,
  engagementId: string,
  requiredLevel?: 'owner' | 'editor' | 'viewer'
): boolean {
  const engagementAccess = accessStore.get(engagementId) ?? [];
  const userAccess = engagementAccess.find((a) => a.userId === userId);

  if (!userAccess) return false;

  if (!requiredLevel) return true;

  const levelHierarchy = { owner: 3, editor: 2, viewer: 1 };
  return levelHierarchy[userAccess.accessLevel] >= levelHierarchy[requiredLevel];
}

/**
 * Grant access to engagement
 */
export function grantEngagementAccess(
  engagementId: string,
  userId: string,
  accessLevel: 'owner' | 'editor' | 'viewer',
  grantedBy: string
): void {
  const engagementAccess = accessStore.get(engagementId) ?? [];

  // Remove existing access for this user
  const filtered = engagementAccess.filter((a) => a.userId !== userId);

  filtered.push({
    engagementId,
    userId,
    accessLevel,
    grantedAt: Date.now(),
    grantedBy,
  });

  accessStore.set(engagementId, filtered);
}

/**
 * Revoke access from engagement
 */
export function revokeEngagementAccess(engagementId: string, userId: string): boolean {
  const engagementAccess = accessStore.get(engagementId) ?? [];
  const filtered = engagementAccess.filter((a) => a.userId !== userId);

  if (filtered.length === engagementAccess.length) return false;

  accessStore.set(engagementId, filtered);
  return true;
}

/**
 * Get all users with access to engagement
 */
export function getEngagementUsers(engagementId: string): EngagementAccess[] {
  return accessStore.get(engagementId) ?? [];
}

/**
 * Get all engagements a user has access to
 */
export function getUserEngagements(userId: string): string[] {
  const engagements: string[] = [];

  for (const [engagementId, accessList] of accessStore) {
    if (accessList.some((a) => a.userId === userId)) {
      engagements.push(engagementId);
    }
  }

  return engagements;
}

/**
 * Middleware factory for engagement access control
 */
export function requireEngagementAccess(requiredLevel?: 'owner' | 'editor' | 'viewer') {
  return async (
    request: FastifyRequest<{ Params: { engagementId: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = (request as AuthenticatedRequest).user;
    const { engagementId } = request.params;

    if (!user) {
      reply.status(401).send({ error: 'Unauthorized', message: 'No user context' });
      return;
    }

    // Admins bypass access control
    if (user.role === 'admin') {
      return;
    }

    if (!hasEngagementAccess(user.id, engagementId, requiredLevel)) {
      reply.status(403).send({
        error: 'Forbidden',
        message: requiredLevel
          ? `Required access level: ${requiredLevel}`
          : 'No access to this engagement',
      });
    }
  };
}

/**
 * Middleware to check document access within engagement
 */
export function requireDocumentAccess() {
  return async (
    request: FastifyRequest<{ Params: { engagementId: string; documentId: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const user = (request as AuthenticatedRequest).user;
    const { engagementId } = request.params;

    if (!user) {
      reply.status(401).send({ error: 'Unauthorized', message: 'No user context' });
      return;
    }

    // Admins bypass access control
    if (user.role === 'admin') {
      return;
    }

    // Document access is tied to engagement access
    if (!hasEngagementAccess(user.id, engagementId, 'viewer')) {
      reply.status(403).send({
        error: 'Forbidden',
        message: 'No access to documents in this engagement',
      });
    }
  };
}

/**
 * Initialize access for a new engagement (grant owner access to creator)
 */
export function initializeEngagementAccess(engagementId: string, creatorId: string): void {
  grantEngagementAccess(engagementId, creatorId, 'owner', creatorId);
}

/**
 * Clean up access records when engagement is deleted
 */
export function cleanupEngagementAccess(engagementId: string): void {
  accessStore.delete(engagementId);
}

/**
 * Audit log entry for access changes
 */
export interface AccessAuditEntry {
  timestamp: number;
  action: 'grant' | 'revoke';
  engagementId: string;
  targetUserId: string;
  performedBy: string;
  accessLevel?: 'owner' | 'editor' | 'viewer';
}

const auditLog: AccessAuditEntry[] = [];

/**
 * Log access change for audit
 */
export function logAccessChange(entry: AccessAuditEntry): void {
  auditLog.push(entry);
}

/**
 * Get audit log for engagement
 */
export function getAccessAuditLog(engagementId: string): AccessAuditEntry[] {
  return auditLog.filter((e) => e.engagementId === engagementId);
}
