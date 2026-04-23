import { Plug } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { ComingSoon } from "../components/common/ComingSoon.js";

export function McpToolsView() {
  return (
    <PageLayout
      mainContent={
        <ComingSoon
          icon={Plug}
          title="MCP tools"
          description="Connect and manage external Model Context Protocol tools. This surface is coming in a future update."
          testId="mcp-coming-soon"
        />
      }
    />
  );
}
