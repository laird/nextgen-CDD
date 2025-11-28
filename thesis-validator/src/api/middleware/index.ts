/**
 * API Middleware Exports
 */

export {
  registerAuth,
  authHook,
  requireRole,
  requirePermission,
  generateToken,
  decodeToken,
  type UserPayload,
  type AuthenticatedRequest,
} from './auth.js';

export {
  hasEngagementAccess,
  grantEngagementAccess,
  revokeEngagementAccess,
  getEngagementUsers,
  getUserEngagements,
  requireEngagementAccess,
  requireDocumentAccess,
  initializeEngagementAccess,
  cleanupEngagementAccess,
  logAccessChange,
  getAccessAuditLog,
  type AccessAuditEntry,
} from './access-control.js';
