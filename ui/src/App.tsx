import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { BackgroundLayer } from "./background/BackgroundLayer.js";
import { Canvas } from "./layout/Canvas.js";
import { ThemeProvider } from "./providers/ThemeProvider.js";
import { ThemedToaster } from "./providers/ThemedToaster.js";
import { KanbanView } from "./views/KanbanView.js";
import { HomeRedirect } from "./views/HomeRedirect.js";
import { NotFoundView } from "./views/NotFoundView.js";
import { PromptsView } from "./views/PromptsView.js";
import { RolesView } from "./views/RolesView.js";
import { SkillsView } from "./views/SkillsView.js";
import { McpToolsView } from "./views/McpToolsView.js";
import { SettingsRedirect } from "./views/SettingsRedirect.js";
import { SettingsDataView } from "./views/SettingsDataView.js";
import { SettingsAppearanceView } from "./views/SettingsAppearanceView.js";
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
      <Route path="/settings" component={SettingsRedirect} />
      <Route path="/settings/data" component={SettingsDataView} />
      <Route path="/settings/appearance" component={SettingsAppearanceView} />
      <Route>
        <NotFoundView />
      </Route>
    </Switch>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BackgroundLayer />
        <Canvas>
          <Routed />
        </Canvas>
        <ThemedToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
