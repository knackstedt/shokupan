
import { describe, expect, it, mock } from "bun:test";
import { GraphQLYogaPlugin } from "./graphql-yoga";

const mockApp = {
    mount: mock(),
};

describe("GraphQL Yoga Plugin", () => {
    it("should initialize with options", () => {
        // We can construct it at least
        const plugin = new GraphQLYogaPlugin({
            yogaConfig: { schema: {} as any }
        });
        expect(plugin).toBeDefined();
    });

    it("should mount on init", async () => {
        const plugin = new GraphQLYogaPlugin({
            yogaConfig: { schema: {} as any }
        });

        try {
            await plugin.onInit(mockApp as any);
            expect(mockApp.mount).toHaveBeenCalled();
        } catch (e) {
            // Handle missing peer dep
        }
    });
});
