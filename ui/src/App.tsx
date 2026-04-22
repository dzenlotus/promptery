import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Route, Switch } from "wouter";
import { FileText, Plug, Settings, Sparkles, UserRound } from "lucide-react";
import { Canvas } from "./layout/Canvas.js";
import { Sidebar } from "./layout/Sidebar.js";
import { MainContent } from "./layout/MainContent.js";
import { KanbanView } from "./views/KanbanView.js";
import { HomeRedirect } from "./views/HomeRedirect.js";
import { NotFoundView } from "./views/NotFoundView.js";
import { PlaceholderView } from "./views/PlaceholderView.js";
import { queryClient } from "./lib/query.js";
import { useWebSocket } from "./hooks/useWebSocket.js";

function Routed() {
  useWebSocket();
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/board/:id" component={KanbanView} />
      <Route path="/roles">
        <PlaceholderView
          icon={UserRound}
          title="Roles"
          description="Reusable AI agent roles. Coming soon."
        />
      </Route>
      <Route path="/tags">
        <PlaceholderView
          icon={FileText}
          title="Prompts"
          description="Library of prompts. Coming soon."
        />
      </Route>
      <Route path="/skills">
        <PlaceholderView
          icon={Sparkles}
          title="Skills"
          description="Focused capabilities. Coming soon."
        />
      </Route>
      <Route path="/mcp">
        <PlaceholderView
          icon={Plug}
          title="MCP tools"
          description="Model Context Protocol integrations. Coming soon."
        />
      </Route>
      <Route path="/settings">
        <PlaceholderView icon={Settings} title="Settings" description="Coming soon." />
      </Route>
      <Route>
        <NotFoundView />
      </Route>
    </Switch>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Canvas>
        <Sidebar />
        <MainContent>
          <Routed />
        </MainContent>
      </Canvas>
      <Toaster theme="dark" position="bottom-right" />
    </QueryClientProvider>
  );
}
