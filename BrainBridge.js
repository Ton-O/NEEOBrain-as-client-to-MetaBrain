var fileContent, brIP;
const fs = require('fs');
const path = require('path');

const { exec } = require('child_process');
const os = require('os');
const http = require('http');
const dgram = require('dgram');
const targetFile = '/var/opt/neeo/nbr-rest.json';
const advertisedName = 'NEEOBETA-jn5168';

            
// Configuration
let DOCKER_IPV4_IP = null;              // CHANGED: Points directly to the dynamic physical host IP where Docker listens
const IPV6_PORT = 3901;            
const DOCKER_PORT = 3901;               // The listening port of your Docker firmware

            
// Initialize sockets
const brainProxy6 = dgram.createSocket('udp6');
const dockerClient4 = dgram.createSocket('udp4');
var nrBRLoggings = 10;
var nrBacktoBRLoggings = 10;

function init() {

    readFileContent(targetFile, 'INITIAL');

    fs.watchFile(targetFile, { interval: 1000 }, (currentStats, previousStats) => {
        if (currentStats.mtimeMs !== previousStats.mtimeMs) {
            readFileContent(targetFile, 'CHANGE');
        }
    });
    
    // Using native avahi-publish command as software on phsyical brain is rather old and newer packages may disrupt NEEO firmware
    // Syntax: avahi-publish -s [Name] [Service_Type] [Port]
    // NOte: although port is filled in with 8088, it is not used anywhere 
    const avahiCmd = `avahi-publish -s "${advertisedName}" _http._tcp 8088 "ip=${getLocalIPv4()}"`;
    
    const advertisementProcess = exec(avahiCmd, (error, stdout, stderr) => {
        if (error) {
            console.error(getFormattedTimestamp(), `[ERROR] mDNS Advertisement failed: ${error.message}`);
            return;
        }
        if (stderr) 
            console.error(getFormattedTimestamp(), `[ERROR] mDNS Advertisement stderr: ${stderr}`);
    });

    console.log(getFormattedTimestamp(), `[INFO] mDNS Advertisement active: ${advertisedName} on port 8088`);

    process.on('exit', () => {
        advertisementProcess.kill();
    });
}

function getFormattedTimestamp() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localTime = new Date(now.getTime() - (offset * 60 * 1000));
    return localTime.toISOString().replace('Z', '').replace('T', ' ');
}

function getLocalIPv4() {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
        const addresses = interfaces[interfaceName];
        for (const addr of addresses) {
            // Check for IPv4 and ensure it is not the local loopback address
            if (addr.family === 'IPv4' && !addr.internal) {
                return addr.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback if no network connection is available
}

function readFileContent(filePath, trigger) {
    fs.readFile(filePath, 'utf8', (error, rawData) => {
        if (error) {
            console.error(getFormattedTimestamp(), `[ERROR] [${trigger}] Failed to read file: ${error.message}`);
            return;
        }
        
        try {
            const newFileContent = JSON.parse(rawData);
            
            if (trigger == 'CHANGE') {
                console.log(getFormattedTimestamp(), `${targetFile} changed from ${JSON.stringify(brIP)} to ${JSON.stringify(newFileContent)}`);
            } else {
                console.log(getFormattedTimestamp(), `${targetFile} loaded initially ${JSON.stringify(newFileContent)}`);
            }
            fileContent = newFileContent;
            brIP = fileContent.nbr_web_server;
            
        } catch (parseError) {
            console.error(getFormattedTimestamp(), `[ERROR] [${trigger}] File content is not valid JSON: ${parseError.message}`);
        }
    });
}


function main() {
let lastBorderRouterInfo = null;

    // --- 1. FROM BORDER ROUTER (eth0/wlan0) TO DOCKER ---
    brainProxy6.on('message', (msg, rinfo) => {
        // Loop prevention: Ignore packets originating from the physical Brain itself
        if (
            rinfo.address === '127.0.0.1' || 
            rinfo.address === '::1' || 
            rinfo.address.includes('127.0.0.1') || 
            rinfo.address.includes('192.168.73.95') // Fysieke Brain own IP address
        ) {
            return;
        }

        const ts = new Date().toISOString();
        
        // If the Docker IP is not known yet, we cannot forward anything
        if (!DOCKER_IPV4_IP) {
            console.warn(getFormattedTimestamp(),`[WARN] UDP received from BR, but Docker IP has not been dynamically detected via HTTP yet!`);
            return;
        }

        console.log(getFormattedTimestamp(),`[IPv6 IN] Packet received from BR (${rinfo.address}) via port ${rinfo.port}`);
        
        lastBorderRouterInfo = { 
            address: rinfo.address, 
            port: rinfo.port 
        };
        console.log(lastBorderRouterInfo);

        // Forward the binary CoAP payload to the dynamically detected Docker IP
        dockerClient4.send(msg, DOCKER_PORT, DOCKER_IPV4_IP, (err) => {
            if (err) console.error(getFormattedTimestamp(),` [IPv4 OUT] Error forwarding to Docker on ${DOCKER_IPV4_IP}:`, err);
            else console.log(getFormattedTimestamp(),` [IPv4 OUT] Forwarded to Docker on ${DOCKER_IPV4_IP}:${DOCKER_PORT}`);
        });
    });

    // --- 2. FROM DOCKER BACK TO BORDER ROUTER ---
    dockerClient4.on('message', (msg) => {
        const ts = new Date().toISOString();
        console.log(getFormattedTimestamp(),`[IPv4 IN] Response received from Docker: ${msg.length} bytes`);
        
        if (lastBorderRouterInfo) {
            brainProxy6.send(msg, lastBorderRouterInfo.port, lastBorderRouterInfo.address, (err) => {
                if (err) console.error(getFormattedTimestamp(),` [IPv6 OUT] Error sending back to BR:`, err);
                else console.log(getFormattedTimestamp(),` [IPv6 OUT] Successfully answered to [${lastBorderRouterInfo.address}]:${lastBorderRouterInfo.port}`);
            });
        } else {
            console.warn(getFormattedTimestamp(),`[WARN] Docker responded, but I do not have an active Border Router context!`);
        }
    });

    // --- 3. FROM DOCKER (IPv4 TCP poort 8080) TO BORDER ROUTER (IPv6 TCP port 8080) ---
    const httpProxyServer = http.createServer((dockerReq, bridgeRes) => {
        const ts = new Date().toISOString();
        
        // Fallback context validation if the filesystem configuration file hasn't loaded yet
        if (!brIP) {
            console.error(getFormattedTimestamp(), '[HTTP PROXY ERROR] Cannot route HTTP proxy request: brIP configuration not loaded yet.');
            bridgeRes.writeHead(503, { 'Content-Type': 'text/plain' });
            bridgeRes.end('Service Unavailable: Border Router configuration missing');
            return;
        }

        // DYNAMIC DETECTION: Extract the IP address of the incoming HTTP client (Docker)
        let remoteIp = dockerReq.socket.remoteAddress;
        if (remoteIp.includes('::ffff:')) {
            remoteIp = remoteIp.replace('::ffff:', ''); // Strip IPv6 wrapper if present
        }

        // Update the variable if the IP address has changed or is new
        if (DOCKER_IPV4_IP !== remoteIp && remoteIp !== '127.0.0.1' && remoteIp !== '::1') {
            DOCKER_IPV4_IP = remoteIp;
            console.log(getFormattedTimestamp(),`[DYNAMIC IP] Docker Brain detected at IP address: ${DOCKER_IPV4_IP}`);
        }

        console.log(getFormattedTimestamp(),`[HTTP IN] HTTP POST received from ${DOCKER_IPV4_IP}: ${dockerReq.method} ${dockerReq.url}`);

        // Prepare the dynamic parameters from the parsed brIP value
        const bracketedHost = brIP.includes('[') ? brIP : `[${brIP}]`;
        const cleanIPv6Target = brIP.replace('[', '').replace(']', '');

        const exactOrderedHeaders = {};
        exactOrderedHeaders['Accept'] = dockerReq.headers['accept'] || 'application/json, text/plain, */*';
        
        if (dockerReq.headers['content-type']) {
            exactOrderedHeaders['Content-Type'] = dockerReq.headers['content-type'];
        }
        
        exactOrderedHeaders['User-Agent'] = 'axios/0.18.0';
        
        if (dockerReq.headers['content-length']) {
            exactOrderedHeaders['Content-Length'] = dockerReq.headers['content-length'];
        }
        
        exactOrderedHeaders['Host'] = `${bracketedHost}:8080`;

        const proxyOptions = {
            host: cleanIPv6Target,
            port: 8080,
            path: dockerReq.url,
            method: dockerReq.method,
            headers: exactOrderedHeaders
        };

        const targetReq = http.request(proxyOptions, (targetRes) => {
            bridgeRes.writeHead(targetRes.statusCode, targetRes.headers);
            targetRes.pipe(bridgeRes);
        });

        targetReq.on('error', (err) => {
            console.error(getFormattedTimestamp(),`[HTTP PROXY ERROR] Could not forward request to IPv6 target (${cleanIPv6Target}):`, err.message);
            bridgeRes.writeHead(502, { 'Content-Type': 'text/plain' });
            bridgeRes.end('Bad Gateway');
        });

        dockerReq.pipe(targetReq);
    });

    httpProxyServer.listen(8080, '0.0.0.0', () => {
        const ts = new Date().toISOString();
        console.log(getFormattedTimestamp(),`HTTP Bridge active: Listening on TCP port 8080 for Docker requests`);
    });

    brainProxy6.bind(IPV6_PORT, '::', () => {
        const ts = new Date().toISOString();
        console.log(getFormattedTimestamp(),`Bridge listening universally on port ${IPV6_PORT} (eth0 + wlan0 activated)`);
    });

    dockerClient4.bind();
}

/**************************************/

init();
main();