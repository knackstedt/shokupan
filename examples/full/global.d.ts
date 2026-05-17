declare module 'shokupan' {
    interface ShokupanContext {
        state: {
            userId: string;
            permissions: string[];
            requestId: string;
            // ... add your custom state properties here
        };
    }
}