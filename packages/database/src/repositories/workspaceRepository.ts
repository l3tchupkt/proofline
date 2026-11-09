import { and, eq, gt, isNull } from 'drizzle-orm';
import type { ProoflineDatabase } from '../client.js';
import { sessions, users, workspaces } from '../schema/index.js';

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

export class WorkspaceRepository {
  constructor(private readonly db: ProoflineDatabase) {}

  async findWorkspaceBySlug(slug: string): Promise<WorkspaceRow | null> {
    const [row] = await this.db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
    return row ?? null;
  }

  async findWorkspaceById(id: string): Promise<WorkspaceRow | null> {
    const [row] = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return row ?? null;
  }

  async createWorkspace(input: {
    id?: string;
    name: string;
    slug: string;
    paypalMerchantPayerId?: string | null;
  }): Promise<WorkspaceRow> {
    const [row] = await this.db
      .insert(workspaces)
      .values({
        id: input.id,
        name: input.name,
        slug: input.slug,
        paypalMerchantPayerId: input.paypalMerchantPayerId ?? null
      })
      .returning();
    if (!row) throw new Error('Failed to insert workspace');
    return row;
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);
    return row ?? null;
  }

  async findUserById(userId: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return row ?? null;
  }

  async createUser(input: {
    id?: string;
    workspaceId: string;
    email: string;
    displayName: string;
    role: 'OWNER' | 'OPERATOR' | 'REVIEWER';
    passwordHash: string;
  }): Promise<UserRow> {
    const [row] = await this.db
      .insert(users)
      .values({
        id: input.id,
        workspaceId: input.workspaceId,
        email: input.email.toLowerCase().trim(),
        displayName: input.displayName,
        role: input.role,
        passwordHash: input.passwordHash
      })
      .returning();
    if (!row) throw new Error('Failed to insert user');
    return row;
  }

  async createSession(input: {
    workspaceId: string;
    userId: string;
    tokenHash: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<SessionRow> {
    const [row] = await this.db.insert(sessions).values(input).returning();
    if (!row) throw new Error('Failed to create session');
    return row;
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<{
    session: SessionRow;
    user: UserRow;
    workspace: WorkspaceRow;
  } | null> {
    const now = new Date();
    const rows = await this.db
      .select({
        session: sessions,
        user: users,
        workspace: workspaces
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .innerJoin(workspaces, eq(sessions.workspaceId, workspaces.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          eq(users.isActive, true)
        )
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }
}

