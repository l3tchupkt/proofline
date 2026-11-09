import { DomainError } from '@proofline/domain';

export type ActorType = 'MERCHANT_USER' | 'SYSTEM_WORKER' | 'AI_ASSISTANT';

export type PermissionAction =
  | 'workspace:read'
  | 'dispute:read'
  | 'dispute:sync'
  | 'evidence:read'
  | 'evidence:upload'
  | 'evidence:delete'
  | 'investigation:run'
  | 'submission:draft'
  | 'submission:approve'
  | 'submission:submit'
  | 'dispute:refund'
  | 'dispute:accept_claim'
  | 'activity:read'
  | 'settings:read';

export type ActorContext =
  | {
      type: 'MERCHANT_USER';
      userId: string;
      workspaceId: string;
      role: 'OWNER' | 'OPERATOR' | 'REVIEWER';
    }
  | {
      type: 'SYSTEM_WORKER';
      workerId: string;
      workspaceId: string;
    }
  | {
      type: 'AI_ASSISTANT';
      runId: string;
      workspaceId: string;
    };

export class AuthorizationError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 403, details);
    this.name = 'AuthorizationError';
  }
}

const AI_ALLOWED_ACTIONS: ReadonlySet<PermissionAction> = new Set<PermissionAction>([
  'workspace:read',
  'dispute:read',
  'evidence:read',
  'investigation:run',
  'submission:draft'
]);

const SYSTEM_ALLOWED_ACTIONS: ReadonlySet<PermissionAction> = new Set<PermissionAction>([
  'workspace:read',
  'dispute:read',
  'dispute:sync',
  'evidence:read',
  'activity:read'
]);

const ROLE_ACTIONS: Record<'OWNER' | 'OPERATOR' | 'REVIEWER', ReadonlySet<PermissionAction>> = {
  OWNER: new Set<PermissionAction>([
    'workspace:read',
    'dispute:read',
    'dispute:sync',
    'evidence:read',
    'evidence:upload',
    'evidence:delete',
    'investigation:run',
    'submission:draft',
    'submission:approve',
    'submission:submit',
    'activity:read',
    'settings:read'
  ]),
  OPERATOR: new Set<PermissionAction>([
    'workspace:read',
    'dispute:read',
    'dispute:sync',
    'evidence:read',
    'evidence:upload',
    'investigation:run',
    'submission:draft',
    'submission:approve',
    'submission:submit',
    'activity:read',
    'settings:read'
  ]),
  REVIEWER: new Set<PermissionAction>([
    'workspace:read',
    'dispute:read',
    'evidence:read',
    'investigation:run',
    'submission:draft',
    'activity:read'
  ])
};

export function canPerformAction(
  actor: ActorContext,
  action: PermissionAction,
  targetWorkspaceId: string
): { allowed: boolean; reason?: string } {
  if (actor.workspaceId !== targetWorkspaceId) {
    return {
      allowed: false,
      reason: 'Cross-workspace access is strictly prohibited.'
    };
  }

  // Nobody can execute automatic refunds or claim acceptance through PROOFLINE.
  if (action === 'dispute:refund' || action === 'dispute:accept_claim') {
    return {
      allowed: false,
      reason: `Action "${action}" is disabled by merchant-safety policy.`
    };
  }

  if (actor.type === 'AI_ASSISTANT') {
    if (!AI_ALLOWED_ACTIONS.has(action)) {
      return {
        allowed: false,
        reason: `AI_ASSISTANT actors are forbidden from executing "${action}". Explicit merchant approval and backend execution are required.`
      };
    }
    return { allowed: true };
  }

  if (actor.type === 'SYSTEM_WORKER') {
    if (!SYSTEM_ALLOWED_ACTIONS.has(action)) {
      return {
        allowed: false,
        reason: `SYSTEM_WORKER actors cannot execute "${action}".`
      };
    }
    return { allowed: true };
  }

  const allowedSet = ROLE_ACTIONS[actor.role];
  if (!allowedSet.has(action)) {
    return {
      allowed: false,
      reason: `Role "${actor.role}" lacks permission "${action}".`
    };
  }

  return { allowed: true };
}

export function assertAuthorized(
  actor: ActorContext,
  action: PermissionAction,
  targetWorkspaceId: string
): void {
  const verdict = canPerformAction(actor, action, targetWorkspaceId);
  if (!verdict.allowed) {
    const code =
      actor.workspaceId !== targetWorkspaceId
        ? 'CROSS_WORKSPACE_ACCESS_DENIED'
        : actor.type === 'AI_ASSISTANT'
          ? 'AI_AUTHORIZATION_DENIED'
          : 'FORBIDDEN_ACTION';
    throw new AuthorizationError(
      code,
      verdict.reason ?? `Unauthorized action "${action}"`,
      {
        actorType: actor.type,
        action,
        actorWorkspaceId: actor.workspaceId,
        targetWorkspaceId
      }
    );
  }
}

