import { QueryClient } from "@tanstack/react-query";
import { rootRouteId } from "@tanstack/react-router";
import { getRouter } from "@/router";
import { describe, expect, it } from "vitest";



// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = getRouter();
    expect(router.options.context.queryClient).toBeInstanceOf(QueryClient);

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
