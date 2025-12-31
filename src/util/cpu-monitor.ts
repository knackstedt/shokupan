import * as os from 'node:os';

export class SystemCpuMonitor {
    private interval: Timer | null = null;
    private lastCpus: os.CpuInfo[] = [];
    private currentUsage: number = 0;

    constructor(private readonly intervalMs: number = 1000) { }

    public start() {
        if (this.interval) return;
        this.lastCpus = os.cpus();
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
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;

        for (let i = 0; i < cpus.length; i++) {
            const cpu = cpus[i];
            const prev = this.lastCpus[i];

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
