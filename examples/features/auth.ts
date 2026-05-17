
import { AuthPlugin } from '../../src/plugins/application/auth';
import { Shokupan } from '../../src/shokupan';

const app = new Shokupan({
    port: 3002
});

const auth = new AuthPlugin({
    jwtSecret: "super-secret-key",
    providers: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            redirectUri: "http://localhost:3002/auth/github/callback"
        },
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            redirectUri: "http://localhost:3002/auth/google/callback"
        }
    },
    onSuccess: (user, ctx) => {
        console.log("Logged in user:", user);
        return ctx.json({ message: "Logged in successfully", user });
    }
});

app.register(auth);
app.mount("/", auth); // Mounts /auth/github/login etc. at root level

app.get("/", (ctx) => {
    const user = (ctx as any).user;
    if (user) {
        return ctx.text(`Hello ${user.name || user.email}!`);
    }
    return ctx.text("Not logged in. Go to /auth/github/login");
});

app.listen();
