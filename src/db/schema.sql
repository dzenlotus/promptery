CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT '#888',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT '#888',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT '#888',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT '#888',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  position REAL NOT NULL,
  role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS role_prompts (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS role_skills (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, skill_id)
);

CREATE TABLE IF NOT EXISTS role_mcp_tools (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  mcp_tool_id TEXT NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, mcp_tool_id)
);

CREATE TABLE IF NOT EXISTS task_prompts (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  origin TEXT NOT NULL DEFAULT 'direct',
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS task_skills (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  origin TEXT NOT NULL DEFAULT 'direct',
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, skill_id)
);

CREATE TABLE IF NOT EXISTS task_mcp_tools (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mcp_tool_id TEXT NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  origin TEXT NOT NULL DEFAULT 'direct',
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, mcp_tool_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Board-level and column-level prompt attachments. Resolver unions these
-- with task-level direct prompts and with role prompts from each layer.
CREATE TABLE IF NOT EXISTS board_prompts (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (board_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS column_prompts (
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (column_id, prompt_id)
);

CREATE INDEX IF NOT EXISTS idx_board_prompts_board ON board_prompts(board_id, position);
CREATE INDEX IF NOT EXISTS idx_column_prompts_column ON column_prompts(column_id, position);
-- idx_boards_role and idx_columns_role reference role_id columns added by
-- migration 006; on existing DBs schema.sql runs before migrations, so
-- those indexes are created inside apply006Inheritance instead.

CREATE INDEX IF NOT EXISTS idx_tasks_board_column ON tasks(board_id, column_id, position);
-- idx_tasks_role is created in migrations.ts after the role_id ALTER on legacy DBs
CREATE INDEX IF NOT EXISTS idx_role_prompts_role ON role_prompts(role_id);
CREATE INDEX IF NOT EXISTS idx_role_skills_role ON role_skills(role_id);
CREATE INDEX IF NOT EXISTS idx_role_mcp_tools_role ON role_mcp_tools(role_id);
CREATE INDEX IF NOT EXISTS idx_task_prompts_task ON task_prompts(task_id);
CREATE INDEX IF NOT EXISTS idx_task_prompts_origin ON task_prompts(task_id, origin);
CREATE INDEX IF NOT EXISTS idx_task_skills_task ON task_skills(task_id);
CREATE INDEX IF NOT EXISTS idx_task_skills_origin ON task_skills(task_id, origin);
CREATE INDEX IF NOT EXISTS idx_task_mcp_tools_task ON task_mcp_tools(task_id);
CREATE INDEX IF NOT EXISTS idx_task_mcp_tools_origin ON task_mcp_tools(task_id, origin);

-- Defensive net for direct SQL DELETE on roles: strips any task_* rows that
-- were inherited from the role. deleteRole() in TS does the same thing
-- before removing the row, so this trigger is belt-and-suspenders.
CREATE TRIGGER IF NOT EXISTS cleanup_role_origin_on_role_delete
AFTER DELETE ON roles
BEGIN
  DELETE FROM task_prompts WHERE origin = 'role:' || OLD.id;
  DELETE FROM task_skills WHERE origin = 'role:' || OLD.id;
  DELETE FROM task_mcp_tools WHERE origin = 'role:' || OLD.id;
END;

-- Prompt groups — many-to-many organisational layer for prompts.
-- Deleting a group cascades to prompt_group_members but not prompts;
-- deleting a prompt cascades to prompt_group_members automatically.
CREATE TABLE IF NOT EXISTS prompt_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_group_members (
  group_id TEXT NOT NULL REFERENCES prompt_groups(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, prompt_id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_groups_position ON prompt_groups(position);
CREATE INDEX IF NOT EXISTS idx_prompt_group_members_group ON prompt_group_members(group_id, position);
CREATE INDEX IF NOT EXISTS idx_prompt_group_members_prompt ON prompt_group_members(prompt_id);
