const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const etag = require('etag');

const hostname = '0.0.0.0';
const httpPort = 3000;
const httpsPort = 3001;
const resourceBaseDir = path.join(__dirname, 'public');

const httpsOptions = {
    key: fs.readFileSync(path.normalize('certs/localhost.key')),
    cert: fs.readFileSync(path.normalize('certs/localhost.crt')),
};

const getResourcePath = (filePath) => path.join(resourceBaseDir, filePath);
const isUnderDirectory = (dir, filePath) => path.normalize(filePath).startsWith(path.normalize(dir));
const getSafeResourcePath = (filePath) => {
    const resourcePath = getResourcePath(filePath);
    return isUnderDirectory(resourceBaseDir, resourcePath) ? resourcePath : resourceBaseDir;
};

const logRequest = (request, response, duration) => {
    const timeString = (new Date()).toISOString();
    const statusCode = response.statusCode;
    const remoteAddress = request.socket.remoteAddress;
    const remotePort = request.socket.remotePort;
    const requestUrl = request.url;
    const userAgent = request.headers['user-agent'];
    const durationMs = duration / 1000;
    console.log(`[${timeString}] ${remoteAddress}:${remotePort} [${statusCode}] ${durationMs}ms: ${requestUrl} ${userAgent}`);
};

const requestHandler = (request, response) => {
    const start = Date.now();
    response.on('close', () => {
        logRequest(request, response, Date.now() - start);
    });

    const resourcePath = getSafeResourcePath(request.url);
    fs.readFile(resourcePath, (err, data) => {
        if (err) {
            switch (err.code) {
                case 'EACCES':
                    response.statusCode = 403;
                    break;
                case 'ENOENT':
                    response.statusCode = 404;
                    break;
                default:
                    response.statusCode = 404;
                    break;
            }
            response.end();
            return;
        }

        const etagHeader = etag(data);
        const clientIfNoneMatch = request.headers['if-none-match'];

        if (clientIfNoneMatch == etagHeader) {
            response.statusCode = 304;
            response.end();
            return;
        }

        const mimeType = mime.lookup(resourcePath);

        response.statusCode = 200;
        response.setHeader('Content-Type', mimeType);
        response.setHeader('ETag', etagHeader);
        response.end(data);
    });
};

const httpRequestHandler = (request, response) => {
    if (request.headers['upgrade-insecure-requests'] === '1') {
        let requestHost = request.headers['host'];
        const indexOfColon = requestHost.indexOf(':');
        if (indexOfColon !== -1) {
            requestHost = requestHost.slice(0, indexOfColon);
        }
        const url = `https://${requestHost}:${httpsPort}${request.url}`;
        response.setHeader('Location', url);
        response.setHeader('Vary', 'Upgrade-Insecure-Requests');
        response.statusCode = 302;
        response.end();
        return;
    }

    requestHandler(request, response);
};

const httpServer = http.createServer(httpRequestHandler);
const httpsServer = https.createServer(httpsOptions, requestHandler);

httpServer.listen(httpPort, hostname, () => {
    console.log(`Resource Directory: ${resourceBaseDir}`);
    console.log(`Server running at http://${hostname}:${httpPort}/`);
});

httpsServer.listen(httpsPort, hostname, () => {
    console.log(`Resource Directory: ${resourceBaseDir}`);
    console.log(`Server running at https://${hostname}:${httpsPort}/`);
});
