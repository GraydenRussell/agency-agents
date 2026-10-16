import "server-only";

/** "mock" swaps every external API for deterministic fakes (see PLAN.md D16). */
export function integrationMode(): "mock" | "live" {
  return process.env.INTEGRATION_MODE === "live" ? "live" : "mock";
}

export const isMock = () => integrationMode() === "mock";
