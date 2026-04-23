import { z } from "zod";

// z.unknown() is optional by default in zod v4; refine to require the key to
// be present in the body so PUT /api/settings/:key { } is rejected.
export const setSettingSchema = z
  .object({ value: z.unknown() })
  .refine((o) => Object.prototype.hasOwnProperty.call(o, "value"), {
    message: "value is required",
    path: ["value"],
  });

export const bulkSettingsSchema = z.object({
  entries: z.record(z.string(), z.unknown()),
});
