import express from "express";
import type { Server } from "http";
import { MEDIUM_JSON } from "../data";

export async function start(port: number) {
    const app = express();

    app.get("/static", (req, res) => {
        res.send("Hello World");
    });

    app.get("/json", (req, res) => {
        res.json(MEDIUM_JSON);
    });

    app.get("/dynamic/:id", (req, res) => {
        res.send(`Dynamic content for ${req.params.id}`);
    });

    let server: Server;
    await new Promise<void>((resolve) => {
        server = app.listen(port, () => {
            resolve();
        });
    });

    return async () => {
        return new Promise<void>((resolve, reject) => {
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    };
}
