import { ClientRequestArgs } from 'http';
import net from 'net';
import tls from 'tls';
import { URL } from 'url';
import { ClientOptions, WebSocket } from 'ws';
import { ClientWebSocketFactory, httpsignature } from '../../app/audiohook';

export const createClientWebSocket: ClientWebSocketFactory = ({
    uri,
    connectHost,
    organizationId,
    sessionId,
    correlationId,
    authInfo,
    logger,
}) => {
    const url = new URL(uri);
    const signatureHeaders = authInfo.clientSecret ? (
        new httpsignature.SignatureBuilder()
            .addComponent('@request-target', url.pathname + url.search)
            .addComponent('@authority', url.host)   // Note: host is normalized (excludes default port even if specified in source)
            .addComponent('audiohook-organization-id', organizationId)
            .addComponent('audiohook-session-id', sessionId)
            .addComponent('audiohook-correlation-id', correlationId)
            .addComponent('x-api-key', authInfo.apiKey)
            .createSignature({
                keyid: authInfo.apiKey,
                key: authInfo.clientSecret
            })
    ) : null;
    const requestHeaders = {
        'Audiohook-Organization-Id': organizationId,
        'Audiohook-Session-Id': sessionId,
        'Audiohook-Correlation-Id': correlationId,
        'X-API-KEY': authInfo.apiKey,
        ...signatureHeaders
    };
    logger.info(`Request headers: ${JSON.stringify(requestHeaders, null, 1)}`);

    const wsOptions: ClientOptions & ClientRequestArgs = {
        followRedirects: false,
        headers: requestHeaders,
    };

    if(connectHost) {
        logger.info(`Connecting to ${uri} via ${connectHost}`);
        const isSecure = url.protocol === 'wss:' || url.protocol === 'https:';
        const canonicalHost = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
        const port = url.port ? parseInt(url.port, 10) : (isSecure ? 443 : 80);
        wsOptions.createConnection = () => {
            if(isSecure) {
                return tls.connect({
                    port,
                    host: connectHost,
                    servername: net.isIP(canonicalHost) ? '' : canonicalHost,
                });
            }
            return net.connect({
                port,
                host: connectHost,
            });
        };
    }

    return new WebSocket(uri, wsOptions);
};

