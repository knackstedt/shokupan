import * as forge from 'node-forge';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger';

const logger = createLogger();

export interface TLSCertOptions {
    key: string;
    cert: string;
}

const CA_NAME = 'Shokupan Local Development CA';
const CA_ORG = 'Shokupan Framework';

/**
 * Ensures a valid local development SSL certificate exists.
 * Generates it and attempts to install it to the system trust store if it doesn't.
 * @returns { key: string, cert: string } for TLS options.
 */
export function ensureLocalSslCertificates(cacheDir = join(process.cwd(), 'node_modules', '.cache', 'shokupan')): TLSCertOptions {
    const keyPath = join(cacheDir, 'dev-key.pem');
    const certPath = join(cacheDir, 'dev-cert.pem');
    const caKeyPath = join(cacheDir, 'ca-key.pem');
    const caCertPath = join(cacheDir, 'ca-cert.pem');

    // Create cache dir if it doesn't exist
    if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
    }

    // Check if certificates exist and are valid (e.g., not expired)
    // For simplicity, we assume they are valid if they exist. In a robust setup,
    // you'd parse them and check the expiration date.
    if (existsSync(keyPath) && existsSync(certPath)) {
        // Try reading them
        try {
            const key = readFileSync(keyPath, 'utf-8');
            const cert = readFileSync(certPath, 'utf-8');
            // Assuming they are valid for now
            return { key, cert };
        } catch (e) {
            logger.warn('SSL', 'Existing dev certificates are invalid or unreadable. Regenerating...', { error: e });
        }
    }

    logger.info('SSL', 'Generating new local development certificates...');

    // 1. Generate or Load CA
    let caCertPem = '';
    let caKeyPem = '';
    let caPkiCert: forge.pki.Certificate;
    let caPrivateKey: forge.pki.PrivateKey;

    if (existsSync(caKeyPath) && existsSync(caCertPath)) {
        caKeyPem = readFileSync(caKeyPath, 'utf-8');
        caCertPem = readFileSync(caCertPath, 'utf-8');
        caPrivateKey = forge.pki.privateKeyFromPem(caKeyPem);
        caPkiCert = forge.pki.certificateFromPem(caCertPem);
    } else {
        const caKeys = forge.pki.rsa.generateKeyPair(2048);
        caPrivateKey = caKeys.privateKey;
        const caCert = forge.pki.createCertificate();
        caCert.publicKey = caKeys.publicKey;
        caCert.serialNumber = '01' + Date.now().toString(16);
        caCert.validity.notBefore = new Date();
        caCert.validity.notAfter = new Date();
        caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10); // 10 years

        const attrs = [{
            name: 'commonName',
            value: CA_NAME
        }, {
            name: 'organizationName',
            value: CA_ORG
        }];
        caCert.setSubject(attrs);
        caCert.setIssuer(attrs);

        caCert.setExtensions([{
            name: 'basicConstraints',
            cA: true
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }]);

        caCert.sign(caPrivateKey, forge.md.sha256.create());

        caPkiCert = caCert;
        caPrivateKey = caKeys.privateKey;
        caCertPem = forge.pki.certificateToPem(caCert);
        caKeyPem = forge.pki.privateKeyToPem(caPrivateKey);

        writeFileSync(caKeyPath, caKeyPem);
        writeFileSync(caCertPath, caCertPem);

        // Attempt to install CA
        installCaCertificate(caCertPath);
    }

    // 2. Generate Server Certificate
    const serverKeys = forge.pki.rsa.generateKeyPair(2048);
    const serverCert = forge.pki.createCertificate();
    serverCert.publicKey = serverKeys.publicKey;
    serverCert.serialNumber = '01' + Date.now().toString(16);
    serverCert.validity.notBefore = new Date();
    // Start date minus 1 day to avoid timezone issues
    serverCert.validity.notBefore.setDate(serverCert.validity.notBefore.getDate() - 1);
    serverCert.validity.notAfter = new Date();
    serverCert.validity.notAfter.setFullYear(serverCert.validity.notBefore.getFullYear() + 1); // 1 year

    const serverAttrs = [{
        name: 'commonName',
        value: 'localhost'
    }, {
        name: 'organizationName',
        value: CA_ORG
    }];
    serverCert.setSubject(serverAttrs);
    serverCert.setIssuer(caPkiCert.subject.attributes); // Issuer is the CA

    serverCert.setExtensions([{
        name: 'basicConstraints',
        cA: false
    }, {
        name: 'keyUsage',
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
    }, {
        name: 'subjectAltName',
        altNames: [{
            type: 2, // dNSName
            value: 'localhost'
        }, {
            type: 7, // iPAddress
            ip: '127.0.0.1'
        }, {
            type: 7, // iPAddress
            ip: '::1'
        }]
    }]);

    // Sign the server certificate with the CA private key
    serverCert.sign(caPrivateKey, forge.md.sha256.create());

    const serverCertPem = forge.pki.certificateToPem(serverCert);
    const serverKeyPem = forge.pki.privateKeyToPem(serverKeys.privateKey);

    writeFileSync(keyPath, serverKeyPem);
    writeFileSync(certPath, serverCertPem);

    logger.info('SSL', 'Generated server certificate for localhost.');

    return { key: serverKeyPem, cert: serverCertPem };
}

function installCaCertificate(caCertPath: string) {
    try {
        if (process.platform === 'win32') {
            logger.info('SSL', 'Attempting to install Local CA to Windows trust store. Please accept any UAC prompts.');
            execSync(`certutil -addstore -user root "${caCertPath}"`, { stdio: 'ignore' });
            logger.info('SSL', 'Local CA installed successfully.');
        } else if (process.platform === 'darwin') {
            logger.info('SSL', 'Attempting to install Local CA to macOS keychain. Please accept any password prompts.');
            execSync(`sudo security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "${caCertPath}"`, { stdio: 'inherit' });
            logger.info('SSL', 'Local CA installed successfully.');
        } else if (process.platform === 'linux') {
            // Very difficult to automate reliably on linux without knowing the distro or browser structure
            logger.warn('SSL', `Automatic CA installation is not robust on Linux. You may need to manually install ${caCertPath} into your browser's trust store or use 'update-ca-certificates'.`);
        }
    } catch (e: any) {
        logger.error('SSL', 'Failed to auto-install Local CA certificate. Browsers may show a security warning.', { error: e.message || String(e) });
    }
}
