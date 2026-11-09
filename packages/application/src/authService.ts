import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { DomainError } from '@proofline/domain';
import { AuditRepository, WorkspaceRepository } from '@proofline/database';

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  email: string;
  displayName: string;
  role: 'OWNER' | 'OPERATOR' | 'REVIEWER';
  csrfToken: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export class AuthService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly auditRepo: AuditRepository
  ) {}

  async ensureBootstrapWorkspaceAndUser(params: {
    workspaceName: string;
    workspaceSlug: string;
    email: string;
    password: string;
    displayName: string;
    role?: 'OWNER' | 'OPERATOR' | 'REVIEWER';
  }): Promise<{ workspaceId: string; userId: string }> {
    let workspace = await this.workspaceRepo.findWorkspaceBySlug(params.workspaceSlug);
    if (!workspace) {
      workspace = await this.workspaceRepo.createWorkspace({
        name: params.workspaceName,
        slug: params.workspaceSlug
      });
    }

    let user = await this.workspaceRepo.findUserByEmail(params.email);
    if (!user) {
      const passwordHash = await argon2.hash(params.password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1
      });
      user = await this.workspaceRepo.createUser({
        workspaceId: workspace.id,
        email: params.email,
        displayName: params.displayName,
        role: params.role ?? 'OWNER',
        passwordHash
      });
    }

    return { workspaceId: workspace.id, userId: user.id };
  }

  async login(
    email: string,
    password: string
  ): Promise<{ rawSessionToken: string; session: AuthenticatedSession }> {
    const user = await this.workspaceRepo.findUserByEmail(email);
    if (!user || !user.isActive) {
      throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.auditRepo.append({
        workspaceId: user.workspaceId,
        actorType: 'MERCHANT_USER',
        actorId: user.id,
        action: 'auth.login_failed',
        resourceType: 'session',
        result: 'DENIED'
      });
      throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
    }

    const workspace = await this.workspaceRepo.findWorkspaceById(user.workspaceId);
    if (!workspace) {
      throw new DomainError('WORKSPACE_NOT_FOUND', 'Workspace for user no longer exists.', 404);
    }

    const rawSessionToken = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const createdSession = await this.workspaceRepo.createSession({
      workspaceId: workspace.id,
      userId: user.id,
      tokenHash: hashToken(rawSessionToken),
      csrfToken,
      expiresAt
    });

    await this.auditRepo.append({
      workspaceId: workspace.id,
      actorType: 'MERCHANT_USER',
      actorId: user.id,
      action: 'auth.login_succeeded',
      resourceType: 'session',
      resourceId: createdSession.id,
      result: 'SUCCESS'
    });

    return {
      rawSessionToken,
      session: {
        sessionId: createdSession.id,
        userId: user.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        csrfToken
      }
    };
  }

  async authenticateToken(rawSessionToken: string): Promise<AuthenticatedSession | null> {
    if (!rawSessionToken || rawSessionToken.length < 32) {
      return null;
    }

    const found = await this.workspaceRepo.findActiveSessionByTokenHash(hashToken(rawSessionToken));
    if (!found) {
      return null;
    }

    return {
      sessionId: found.session.id,
      userId: found.user.id,
      workspaceId: found.workspace.id,
      workspaceName: found.workspace.name,
      workspaceSlug: found.workspace.slug,
      email: found.user.email,
      displayName: found.user.displayName,
      role: found.user.role,
      csrfToken: found.session.csrfToken
    };
  }

  async logout(session: AuthenticatedSession): Promise<void> {
    await this.workspaceRepo.revokeSession(session.sessionId);
    await this.auditRepo.append({
      workspaceId: session.workspaceId,
      actorType: 'MERCHANT_USER',
      actorId: session.userId,
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: session.sessionId,
      result: 'SUCCESS'
    });
  }
}

