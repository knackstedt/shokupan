import autocannon from "autocannon";

function runAutocannon(url: string) {
    return new Promise<any>((resolve, reject) => {
        autocannon({
            url,
            connections: 100,
            duration: 5
        }, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

async function main() {
    const res = await runAutocannon("http://localhost:8888/static");
    console.log(`Requests/sec: ${res.requests.average.toFixed(2)}`);
    console.log(`Latency (ms): ${res.latency.average.toFixed(2)}`);
    console.log(`Throughput (MB/s): ${(res.throughput.average / 1024 / 1024).toFixed(2)}`);
}

main();
