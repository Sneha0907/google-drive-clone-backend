export type Role = 'viewer' | 'editor' | 'owner';

export type Action =
  | 'read'
  | 'write'      // rename/move/soft delete/restore
  | 'hard-delete'
  | 'share';

const can: Record<Role, Action[]> = {
  viewer: ['read'],
  editor: ['read', 'write'],
  owner:  ['read', 'write', 'hard-delete', 'share'],
};

export function roleAllows(role: Role, action: Action) {
  return can[role]?.includes(action) ?? false;
}
