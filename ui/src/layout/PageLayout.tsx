import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar.js";
import { MainContent } from "./MainContent.js";

interface Props {
  sidebarContent?: ReactNode;
  mainContent: ReactNode;
}

/**
 * Master-detail page scaffold: sidebar tabs + page-specific sidebar section,
 * paired with the main content area. Every top-level view renders one of these
 * so the two-column Canvas grid stays populated consistently.
 */
export function PageLayout({ sidebarContent, mainContent }: Props) {
  return (
    <>
      <Sidebar>{sidebarContent}</Sidebar>
      <MainContent>{mainContent}</MainContent>
    </>
  );
}
