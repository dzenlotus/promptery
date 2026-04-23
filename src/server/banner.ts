/**
 * ANSI SGR colour wrapper. No-op when stdout isn't a TTY (piped output,
 * child process with stdio: "ignore", CI logs) so captured output stays
 * clean of escape sequences.
 */
function color(code: string, text: string): string {
  if (!process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export interface StartupBannerOptions {
  url: string;
  version: string;
  homeDir: string;
  dbPath: string;
  devMode: boolean;
}

export function printStartupBanner(options: StartupBannerOptions): void {
  const { url, version, homeDir, dbPath, devMode } = options;
  const pink = (s: string) => color("95", s);
  const green = (s: string) => color("32", s);
  const dim = (s: string) => color("2", s);
  const bold = (s: string) => color("1", s);
  const cyan = (s: string) => color("36", s);
  const yellow = (s: string) => color("93", s);

  const title = devMode
    ? `${bold("Promptery")} ${dim(`v${version}`)} ${yellow("[DEV]")}`
    : `${bold("Promptery")} ${dim(`v${version}`)}`;

  const lines = [
    "",
    `         ${pink(".--.")}`,
    `      ${pink(".-(    ).")}`,
    `     ${pink("(___.__)__)")}`,
    `       ${green("\\__/")}`,
    `        ${green("|")}`,
    "",
    `  ${title}`,
    `  ${dim("Context orchestration for AI agents")}`,
    "",
    `  ${dim("→")} UI:     ${cyan(url)}`,
    `  ${dim("→")} Home:   ${dim(homeDir)}`,
    `  ${dim("→")} DB:     ${dim(dbPath)}`,
    `  ${dim("→")} MCP:    ${dim("agents connect via bridge process")}`,
    `  ${dim("→")} Docs:   ${dim("https://github.com/dzenlotus/promptery")}`,
    "",
    `  ${dim("Press Ctrl+C to stop")}`,
    "",
  ];

  console.log(lines.join("\n"));
}
