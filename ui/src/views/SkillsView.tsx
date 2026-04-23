import { Sparkles } from "lucide-react";
import { PageLayout } from "../layout/PageLayout.js";
import { ComingSoon } from "../components/common/ComingSoon.js";

export function SkillsView() {
  return (
    <PageLayout
      mainContent={
        <ComingSoon
          icon={Sparkles}
          title="Skills"
          description="Reusable behaviour snippets you'll be able to drop into roles and tasks. This surface is coming in a future update."
          testId="skills-coming-soon"
        />
      }
    />
  );
}
