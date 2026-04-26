import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { BackgroundLayer } from "./background/BackgroundLayer.js";
import { Canvas } from "./layout/Canvas.js";
import { ThemeProvider } from "./providers/ThemeProvider.js";
import { ThemedToaster } from "./providers/ThemedToaster.js";
import { TooltipProvider } from "./components/ui/Tooltip.js";
import { DevModeIndicator } from "./components/DevModeIndicator.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { KanbanView } from "./views/KanbanView.js";
import { SpaceSettingsView } from "./views/SpaceSettingsView.js";
import { TaskRedirect } from "./views/TaskRedirect.js";
import { HomeRedirect } from "./views/HomeRedirect.js";
import { NotFoundView } from "./views/NotFoundView.js";
import { PromptsView } from "./views/PromptsView.js";
import { PromptGroupView } from "./views/PromptGroupView.js";
import { RolesView } from "./views/RolesView.js";
import { SkillsView } from "./views/SkillsView.js";
import { McpToolsView } from "./views/McpToolsView.js";
import { SettingsRedirect } from "./views/SettingsRedirect.js";
import { SettingsDataView } from "./views/SettingsDataView.js";
import { SettingsAppearanceView } from "./views/SettingsAppearanceView.js";
import { queryClient } from "./lib/query.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { useUndoRedoHotkeys } from "./hooks/useUndoRedoHotkeys.js";

function Routed() {
  useWebSocket();
  useUndoRedoHotkeys();
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/board/:id" component={KanbanView} />
      {/* Short alias matching `/s/:id` and `/t/:id` per the v0.3.0 URL
          scheme. Keeps `/board/:id` working for saved bookmarks. */}
      <Route path="/b/:id" component={KanbanView} />
      <Route path="/s/:id" component={SpaceSettingsView} />
      <Route path="/t/:idOrSlug" component={TaskRedirect} />
      <Route path="/roles" component={RolesView} />
      {/* Group detail pattern is more specific — wouter Switch picks it
          first for two-segment URLs. Optional `:id?` below covers both
          /prompts (no id) and /prompts/<id> (selected prompt) in the SAME
          mounted component, so clicking a prompt just toggles a route
          param instead of remounting PromptsView (and losing local state). */}
      <Route path="/prompts/groups/:id" component={PromptGroupView} />
      <Route path="/prompts/:id?" component={PromptsView} />
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <BackgroundLayer />
            <Canvas>
              <ErrorBoundary>
                <Routed />
              </ErrorBoundary>
            </Canvas>
            <DevModeIndicator />
            <ThemedToaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
