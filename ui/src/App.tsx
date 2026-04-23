import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Route, Switch } from "wouter";
import { Canvas } from "./layout/Canvas.js";
import { KanbanView } from "./views/KanbanView.js";
import { HomeRedirect } from "./views/HomeRedirect.js";
import { NotFoundView } from "./views/NotFoundView.js";
import { PlaceholderView } from "./views/PlaceholderView.js";
import { PromptsView } from "./views/PromptsView.js";
import { RolesView } from "./views/RolesView.js";
import { SkillsView } from "./views/SkillsView.js";
import { McpToolsView } from "./views/McpToolsView.js";
import { queryClient } from "./lib/query.js";
import { useWebSocket } from "./hooks/useWebSocket.js";

function Routed() {
  useWebSocket();
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/board/:id" component={KanbanView} />
      <Route path="/roles" component={RolesView} />
      <Route path="/prompts" component={PromptsView} />
      <Route path="/skills" component={SkillsView} />
      <Route path="/mcp" component={McpToolsView} />
      <Route path="/settings" component={PlaceholderView} />
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
        <Routed />
      </Canvas>
      <Toaster theme="dark" position="bottom-right" />
    </QueryClientProvider>
  );
}
