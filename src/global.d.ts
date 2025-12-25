declare global {
    namespace Express {
        interface Request {
            formattedUrl: string; // Adding a custom property
        }
    }
}