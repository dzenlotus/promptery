import { useLocation } from "wouter";
import { Button } from "../components/ui/Button.js";
import { ROUTES } from "../lib/routes.js";

export function NotFoundView() {
  const [, setLocation] = useLocation();
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center max-w-[360px]">
        <h2 className="text-[18px] font-semibold tracking-tight mb-1.5">Page not found</h2>
        <p className="text-[13px] text-[var(--color-text-muted)] mb-4">
          The URL does not match any page in Promptery.
        </p>
        <Button variant="primary" onClick={() => setLocation(ROUTES.home)}>
          Go home
        </Button>
      </div>
    </div>
  );
}
