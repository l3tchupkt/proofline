import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ActorContext } from '@proofline/authorization';
import type { AuthenticatedSession, AuthService } from '@proofline/application';
import { DomainError } from '@proofline/domain';

export const SESSION_COOKIE_NAME = 'proofline_session';

declare module 'fastify' {
  interface FastifyRequest {
    authSession: AuthenticatedSession | null;
    actorContext: ActorContext | null;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createAuthHooks(authService: AuthService) {
  const requireSession = async (request: FastifyRequest, _reply: FastifyReply) => {
    const rawCookie = request.cookies?.[SESSION_COOKIE_NAME];
    if (!rawCookie) {
      throw new DomainError('UNAUTHORIZED', 'Authentication is required.', 401);
    }

    const session = await authService.authenticateToken(rawCookie);
    if (!session) {
      throw new DomainError('SESSION_INVALID', 'Session is expired or invalid.', 401);
    }

    request.authSession = session;
    request.actorContext = {
      type: 'MERCHANT_USER',
      userId: session.userId,
      workspaceId: session.workspaceId,
      role: session.role
    };
  };

  const requireCsrf = async (request: FastifyRequest, _reply: FastifyReply) => {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return;
    }
    const session = request.authSession;
    if (!session) {
      throw new DomainError('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    const headerToken = request.headers['x-csrf-token'];
    const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    if (!token || !constantTimeEquals(token, session.csrfToken)) {
      throw new DomainError('CSRF_TOKEN_INVALID', 'Missing or invalid CSRF token.', 403);
    }
  };

  return {
    requireSession,
    requireCsrf
  };
}

