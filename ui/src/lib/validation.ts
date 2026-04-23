/**
 * Shared name rules for prompts / roles / skills / mcp-tools.
 * Must stay in sync with `src/server/validators/common.ts`.
 */
const NAME_ALLOWED_CHARS = /^[a-zA-Z0-9 _-]+$/;
const NAME_CONTAINS_LETTER = /[a-zA-Z]/;
export const NAME_MAX_LENGTH = 50;

export function validateEntityName(name: string): string | null {
  if (!name || name.length === 0) return "Name is required";
  if (name.length > NAME_MAX_LENGTH) {
    return `Name must be at most ${NAME_MAX_LENGTH} characters`;
  }
  if (name.trim().length === 0) return "Name cannot be blank";
  if (!NAME_ALLOWED_CHARS.test(name)) {
    return "Use English letters, digits, spaces, '-' or '_' only";
  }
  if (!NAME_CONTAINS_LETTER.test(name)) {
    return "Name must include at least one letter";
  }
  return null;
}
