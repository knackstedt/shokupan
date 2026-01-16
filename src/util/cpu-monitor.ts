// import * as os from 'node:os';
type CpuInfo = { times: { user: number; nice: number; sys: number; idle: number; irq: number; }; };

export class SystemCpuMonitor {
    private interval: Timer | null = null;
    private lastCpus: CpuInfo[] = [];
    private currentUsage: number = 0;
    private osStub: any = null;

    constructor(private readonly intervalMs: number = 1000) {
        this.init();
    }

    private async init() {
        try {
            // @ts-ignore
            if (typeof process !== "undefined" && process.versions && process.versions.node) {
                this.osStub = await import('node:os');
            }
        } catch (e) {
            // Ignore
        }
    }

    public start() {
        if (this.interval) return;
        if (!this.osStub) return; // silent failure in unsupported envs

        this.lastCpus = this.osStub.cpus();
        this.interval = setInterval(() => this.update(), this.intervalMs);
    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    public getUsage(): number {
        return this.currentUsage;
    }

    private update() {
        if (!this.osStub) return;

        const cpus = this.osStub.cpus();
        let idle = 0;
        let total = 0;

        for (let i = 0; i < cpus.length; i++) {
            const cpu = cpus[i];
            const prev = this.lastCpus[i];

            if (!prev) continue;

            let type: keyof typeof cpu.times;
            for (type in cpu.times) {
                const ticks = cpu.times[type];
                const prevTicks = prev.times[type];
                const diff = ticks - prevTicks;
                total += diff;
                if (type === 'idle') {
                    idle += diff;
                }
            }
        }

        this.lastCpus = cpus;
        this.currentUsage = total === 0 ? 0 : (1 - idle / total) * 100;
    }
}
