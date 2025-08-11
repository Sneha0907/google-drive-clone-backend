import { supabase } from '../db.js';
import { roleAllows, Role, Action } from './permissions.js';

type ResourceType = 'file' | 'folder';

export async function resolveUserRole(
  userId: string | null,
  resourceType: ResourceType,
  resourceId: string,
  shareToken?: string | null
): Promise<Role | null> {
  // 1) owner?
  const ownerCol = resourceType === 'file' ? 'owner_id' : 'owner_id';
  const table = resourceType === 'file' ? 'files' : 'folders';
  const ownerRow = await supabase.from(table).select('owner_id').eq('id', resourceId).single();
  if (ownerRow.data?.owner_id && userId && ownerRow.data.owner_id === userId) {
    return 'owner';
  }

  // 2) email-based permission?
  if (userId) {
    // typically you store user email in JWT; if not, query from users table via userId
    // here we assume you stored email in JWT
    // (req as any).user.email exists in your auth middleware
    // we'll pass email in from route
  }

  // This function only checks owner & share token; grantee_email resolution can be added by caller.

  // 3) link share token?
  if (shareToken) {
    const sh = await supabase
      .from('shares')
      .select('role,expires_at')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .eq('link_token', shareToken)
      .single();

    if (sh.data) {
      if (sh.data.expires_at && new Date(sh.data.expires_at) < new Date()) return null;
      return sh.data.role as Role;
    }
  }

  return null;
}

export async function ensureAllowed(
  role: Role | null,
  action: Action
) {
  if (!role || !roleAllows(role, action)) {
    const err: any = new Error('Not allowed');
    err.status = 403;
    throw err;
  }
}
