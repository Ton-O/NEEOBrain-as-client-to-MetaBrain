var fileContent, brIP;
const fs = require('fs');
const path = require('path');

const { exec } = require('child_process');
const os = require('os');
const http = require('http');
const dgram = require('dgram');
const { Gpio } = require('onoff');

const targetFile = '/var/opt/neeo/nbr-rest.json';
const initFile = '/steady/neeo/cp6/BRAINNAME.json';
let advertisedName = 'NEEOBETA-jn5168';
var PhysBrainIPAddress;
            
// Configuration
var DOCKER_IPV4_IP = null;                              // CHANGED: Points directly to the dynamic physical host IP where Docker listens
const IPV6_PORT = 3901;            
const DOCKER_PORT = 3901;                               // The listening port of your Docker firmware

const TOUCHBUTTON_PIN = process.env.NEEO_GPIO_TOUCHBUTTON_VALUE || 239;
const DEBOUNCE_TIMEOUT_MS = 20;
const LONG_PRESS_TIMEOUT_MS = 6000;

            
// Initialize sockets
const brainProxy6 = dgram.createSocket('udp6');
const dockerClient4 = dgram.createSocket('udp4');
var nrBRLoggings = 10;
var nrBacktoBRLoggings = 10;

class TouchButton {
    constructor() {
        this.touchButtonPressedTimestamp = -1;
        this.longPressTimer = null;
    }

    _armLongPressAction() {
        this.longPressTimer = setTimeout(() => {
            console.log(getFormattedTimestamp(), 
                        "-> debug: long press detected (6s)");
            sendHttpGet("LongTouchButton");
            this.longPressTimer = null;
        }, LONG_PRESS_TIMEOUT_MS);
    }

    registerKeypress(isPressed) {
        if (isPressed) {
            this.touchButtonPressedTimestamp = Date.now();
            this._armLongPressAction();
        } else {
            if (this.longPressTimer !== null) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
                sendHttpGet("TouchButton");
            }
        }
    }
}

function sendHttpGet(endpoint) {
    if (!DOCKER_IPV4_IP) {
        console.warn(getFormattedTimestamp(),
            `[WARN] ${endpoint} call received for Brain,  but Docker IP has not been dynamically detected via HTTP yet!`);
        return;
    }
    const url = `http://${DOCKER_IPV4_IP}:3000/v1/api/${endpoint}`;

    console.log(getFormattedTimestamp(), 
                        `[HTTP OUT] Sending: GET ${url}`);
    
    http.get(url, (res) => {
        console.log(getFormattedTimestamp(), 
                        `[HTTP OUT] Response status: ${res.statusCode}`);
        res.resume(); // Consume response data to free up memory
    }).on('error', (err) => {
        console.error(getFormattedTimestamp(), 
                        `[HTTP OUT ERROR] Failed to connect to ${url}:`, err.message);
    });
}

function initGpioTouchbutton() {
    console.log(getFormattedTimestamp(), 
                        `[GPIO INIT] Initializing touchbutton on GPIO pin: ${TOUCHBUTTON_PIN}`);
    try {
        const touchbuttonHandler = new TouchButton();

        try {
            new Gpio(TOUCHBUTTON_PIN, "in", "both").unexport();
        } catch (e) {
            // Pin was already unexported, safe to ignore
        }

        const hardwarePin = new Gpio(TOUCHBUTTON_PIN, "in", "both", {
            debounceTimeout: DEBOUNCE_TIMEOUT_MS
        });

        hardwarePin.watch((err, value) => {
            if (err) {
                console.error(getFormattedTimestamp(), 
                        "[GPIO ERROR] Watch failed:", err.message);
                return;
            }
            touchbuttonHandler.registerKeypress(value === 1);
        });

        process.on('exit', () => {
            hardwarePin.unexport();
        });

    } catch (err) {
        console.error(getFormattedTimestamp(), 
                        "[GPIO ERROR] Initialization failed:", err.message);
    }
}

function readInitFile() {
    try {
        const cleanName = advertisedName.replace('-jn5168', '');

        if (fs.existsSync(initFile)) {
            const data = fs.readFileSync(initFile, 'utf8');
            const config = JSON.parse(data);
            if (config && config.advertisedName) {
                                                        // Remove existing suffix if present in the user's file before adding it 
                                                        // for runtime execution
                const baseConfigName = config.advertisedName.replace('-jn5168', '');
                advertisedName = baseConfigName + "-jn5168";
                console.log(getFormattedTimestamp(), 
                        `[INIT CONFIG] Loaded advertisedName from config: ${advertisedName}`);
            } else {
                console.warn(getFormattedTimestamp(), 
                        `[INIT CONFIG] key 'advertisedName' missing in JSON. Rewriting with default.`);
                const defaultConfig = { advertisedName: cleanName };
                fs.writeFileSync(initFile, JSON.stringify(defaultConfig, null, 4), 'utf8');
                advertisedName = cleanName + "-jn5168";
            }
        } else {
            const defaultConfig = { advertisedName: cleanName };
            fs.writeFileSync(initFile, JSON.stringify(defaultConfig, null, 4), 'utf8');
            console.log(getFormattedTimestamp(), 
                        `[INIT CONFIG] Created default configuration file at: ${initFile}`);
            advertisedName = cleanName + "-jn5168";
        }    } catch (err) {
        console.error(getFormattedTimestamp(), 
                        `[INIT CONFIG ERROR] Failed to process ${initFile}:`, err.message);
    }
}

function init() {

    readInitFile();

    readFileContent(targetFile, 'INITIAL');

    fs.watchFile(targetFile, { interval: 1000 }, (currentStats, previousStats) => {
        if (currentStats.mtimeMs !== previousStats.mtimeMs) {
            readFileContent(targetFile, 'CHANGE');
        }
    });
    
                                                        // Using native avahi-publish command as software on brain is rather old 
                                                        // and newer packages may disrupt NEEO firmware
                                                        // Syntax: avahi-publish -s [Name] [Service_Type] [Port]
    PhysBrainIPAddress = getLocalIPv4();
    const avahiCmd = `avahi-publish -s "${advertisedName}" _http._tcp 8088 "ip=${PhysBrainIPAddress}"`;
    
    const advertisementProcess = exec(avahiCmd, (error, stdout, stderr) => {
        if (error) {
            console.error(getFormattedTimestamp(), 
                        `[ERROR] mDNS Advertisement failed: ${error.message}`);
            return;
        }
        if (stderr) 
            console.error(getFormattedTimestamp(), 
                        `[ERROR] mDNS Advertisement stderr: ${stderr}`);
    });

    console.log(getFormattedTimestamp(), 
                        `[INFO] mDNS Advertisement active: ${advertisedName} on port 8088`);

    initGpioTouchbutton();

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
            console.error(getFormattedTimestamp(), 
                        `[ERROR] [${trigger}] Failed to read file: ${error.message}`);
            return;
        }
        
        try {
            const newFileContent = JSON.parse(rawData);
            
            if (trigger == 'CHANGE') {
                console.log(getFormattedTimestamp(), 
                        `${targetFile} changed from ${JSON.stringify(brIP)} to ${JSON.stringify(newFileContent)}`);
            } else {
                console.log(getFormattedTimestamp(), 
                        `${targetFile} loaded initially ${JSON.stringify(newFileContent)}`);
            }
            fileContent = newFileContent;
            brIP = fileContent.nbr_web_server;
            
        } catch (parseError) {
            console.error(getFormattedTimestamp(), 
                        `[ERROR] [${trigger}] File content is not valid JSON: ${parseError.message}`);
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
            rinfo.address.includes(PhysBrainIPAddress)  // Physical Brain own IP address
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
            if (err) console.error(getFormattedTimestamp(),
                        ` [IPv4 OUT] Error forwarding to Docker on ${DOCKER_IPV4_IP}:`, err);
            else console.log(getFormattedTimestamp(),
                        ` [IPv4 OUT] Forwarded to Docker on ${DOCKER_IPV4_IP}:${DOCKER_PORT}`);
        });
    });

                                                        // --- 2. FROM DOCKER BACK TO BORDER ROUTER ---
    dockerClient4.on('message', (msg) => {
        const ts = new Date().toISOString();
        console.log(getFormattedTimestamp(),
                        `[IPv4 IN] Response received from Docker: ${msg.length} bytes`);
        
        if (lastBorderRouterInfo) {
            brainProxy6.send(msg, lastBorderRouterInfo.port, lastBorderRouterInfo.address, (err) => {
                if (err) console.error(getFormattedTimestamp(),
                        ` [IPv6 OUT] Error sending back to BR:`, err);
                else console.log(getFormattedTimestamp(),
                        ` [IPv6 OUT] Successfully answered to [${lastBorderRouterInfo.address}]:${lastBorderRouterInfo.port}`);
            });
        } else {
            console.warn(getFormattedTimestamp(),
                        `[WARN] Docker responded, but I do not have an active Border Router context!`);
        }
    });

                                                        // --- 3. FROM DOCKER (IPv4 TCP poort 8080) TO BORDER ROUTER (IPv6 TCP port 8080) ---
    const httpProxyServer = http.createServer((dockerReq, bridgeRes) => {
        const ts = new Date().toISOString();
        
                                                        // Fallback context validation if the filesystem configuration file hasn't loaded yet
        if (!brIP) {
            console.error(getFormattedTimestamp(), 
                        '[HTTP PROXY ERROR] Cannot route HTTP proxy request: brIP configuration not loaded yet.');
            bridgeRes.writeHead(503, { 'Content-Type': 'text/plain' });
            bridgeRes.end('Service Unavailable: Border Router configuration missing');
            return;
        }

                                                        // Extract the IP address of the incoming HTTP client (Docker)
        let remoteIp = dockerReq.socket.remoteAddress;
        if (remoteIp.includes('::ffff:')) {
            remoteIp = remoteIp.replace('::ffff:', ''); // Strip IPv6 wrapper if present
        }

                                                        // Update the variable if the IP address has changed or is new
        if (DOCKER_IPV4_IP !== remoteIp && remoteIp !== '127.0.0.1' && remoteIp !== '::1') {
            DOCKER_IPV4_IP = remoteIp;
            console.log(getFormattedTimestamp(),
                        `[DYNAMIC IP] Docker Brain detected at IP address: ${DOCKER_IPV4_IP}`);
        }

        console.log(getFormattedTimestamp(),
                        `[HTTP IN] HTTP POST received from ${DOCKER_IPV4_IP}: ${dockerReq.method} ${dockerReq.url}`);

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
            console.error(getFormattedTimestamp(),
                        `[HTTP PROXY ERROR] Could not forward request to IPv6 target (${cleanIPv6Target}):`, err.message);
            bridgeRes.writeHead(502, { 'Content-Type': 'text/plain' });
            bridgeRes.end('Bad Gateway');
        });

        dockerReq.pipe(targetReq);
    });

    httpProxyServer.listen(8080, '0.0.0.0', () => {
        const ts = new Date().toISOString();
        console.log(getFormattedTimestamp(),
                        `HTTP Bridge active: Listening on TCP port 8080 for Docker requests`);
    });

    brainProxy6.bind(IPV6_PORT, '::', () => {
        const ts = new Date().toISOString();
        console.log(getFormattedTimestamp(),
                        `Bridge listening universally on port ${IPV6_PORT} (eth0 + wlan0 activated)`);
    });

    dockerClient4.bind();
}

init();
main();