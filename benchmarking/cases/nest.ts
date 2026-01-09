import { Controller, Get, Module, Param } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MEDIUM_JSON } from "../data.ts";

@Controller()
class AppController {
    @Get("static")
    getStatic() {
        return "Hello World";
    }

    @Get("json")
    getJson() {
        return MEDIUM_JSON;
    }

    @Get("dynamic/:id")
    getDynamic(@Param("id") id: string) {
        return `Dynamic content for ${id}`;
    }
}

@Module({
    controllers: [AppController],
})
class AppModule { }

export async function start(port: number) {
    const app = await NestFactory.create(AppModule, {
        logger: false,
        bodyParser: false, // Benchmark optimization usually done, but keeping default checks is fair too. Let's keep defaults mostly.
    });

    await app.listen(port);

    return async () => {
        await app.close();
    };
}
