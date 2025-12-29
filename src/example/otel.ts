import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'basic-service',
    }),
    spanProcessors: [
        new SimpleSpanProcessor(
            new OTLPTraceExporter({
                url: 'http://localhost:4318/v1/traces', // Default OTLP port
            })
        )
    ],
});
provider.register();