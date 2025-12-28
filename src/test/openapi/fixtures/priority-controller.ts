import { ShokupanContext } from "../../../context";
import { Controller, Get, Spec } from "../../../decorators";

@Controller("/priority")
export class PriorityController {
    /**
     * @summary AST Summary
     */
    @Get("/")
    @Spec({ summary: "Spec Summary" }) // Should win
    testMethod(ctx: ShokupanContext) {
        return ctx.text("AST Response");
    }

    @Get("/mixed")
    // No @Spec, should rely on AST or Decorators
    mixedMethod(ctx: ShokupanContext) {
        return ctx.text("Mixed");
    }
}
