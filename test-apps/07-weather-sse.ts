import { Shokupan } from '../src/index';

/**
 * Sample 7: Real-time Weather with SSE
 * Tests: SSE streaming, AsyncAPI generation, route parameters
 */

const app = new Shokupan({
    port: 3109,
    development: true,
    enableAsyncApiGen: true
});

interface WeatherReading {
    city: string;
    temperature: number;
    humidity: number;
    conditions: string;
    timestamp: string;
}

const weatherData: Record<string, WeatherReading> = {
    'tokyo': { city: 'Tokyo', temperature: 22, humidity: 65, conditions: 'Partly Cloudy', timestamp: new Date().toISOString() },
    'london': { city: 'London', temperature: 15, humidity: 80, conditions: 'Rainy', timestamp: new Date().toISOString() },
    'nyc': { city: 'New York', temperature: 18, humidity: 55, conditions: 'Sunny', timestamp: new Date().toISOString() }
};

// Health
app.get('/health', () => ({ status: 'ok', service: 'weather-sse' }));

// Current weather for a city
app.get('/weather/:city', (ctx) => {
    const city = ctx.params.city.toLowerCase();
    const data = weatherData[city];
    if (!data) return ctx.json({ error: 'City not found' }, 404);
    return { data };
});

// All cities
app.get('/weather', () => ({ cities: Object.values(weatherData) }));

// SSE stream of weather updates
app.get('/weather/:city/live', (ctx) => {
    const city = ctx.params.city.toLowerCase();
    if (!weatherData[city]) return ctx.json({ error: 'City not found' }, 404);

    return ctx.streamSSE(async (stream) => {
        const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy', 'Stormy'];
        for (let i = 0; i < 3; i++) {
            const reading: WeatherReading = {
                city: weatherData[city].city,
                temperature: weatherData[city].temperature + Math.random() * 4 - 2,
                humidity: Math.min(100, Math.max(0, weatherData[city].humidity + Math.random() * 10 - 5)),
                conditions: conditions[Math.floor(Math.random() * conditions.length)],
                timestamp: new Date().toISOString()
            };
            await stream.writeSSE({
                id: String(i),
                event: 'weather-update',
                data: JSON.stringify(reading)
            });
            await stream.sleep(100);
        }
    });
});

// Update weather data
app.post('/weather/:city', async (ctx) => {
    const city = ctx.params.city.toLowerCase();
    const body = await ctx.body() as Partial<WeatherReading>;
    if (!weatherData[city]) {
        weatherData[city] = { city: ctx.params.city, temperature: 20, humidity: 50, conditions: 'Unknown', timestamp: new Date().toISOString(), ...body };
    } else {
        Object.assign(weatherData[city], body, { timestamp: new Date().toISOString() });
    }
    return { data: weatherData[city] };
});

await app.listen();
console.log('Weather SSE App running on https://localhost:3109');
