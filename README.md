# NEEOBrain as client to MetaBrain
Allow physical NEEO brain to be used with virtual MetaBrain 
## Short description
This repository contains shell scripts and Javascript to configure your physical NEEO Brain to act as a client for a virtualised MetaBrain.
##  Functionality
The essence of this repository is to setup your older physical NEEO BRain in such a way that it still provides the functions that are invaluable but not so resource-consuming.  
We all loved our NEEO-brain and -remote but after a while, we found it is lacking speed and memory to keep up with newer developments. When you still use it the way you used it when it came out of the box, then you'll probably not complaining but if your want more (like I do), you'll be gettig tired from waiting 2 minutes after a restart.
So I developed MetaBrain, a solution with custom firmware, based on the original NEEO, but running on much more versatile hardware, therefore being magnitudes faster.
That was a nearly perfect solution, allowing you to run your NEEO remote way faster and with a virtualised MetaBrain. It provided all functions just as the normal NEEO Brain.
However, never could I implement the pairing of a (new) remote, simply as that required specific hardware and firmware for it. Let's call it "Border router with JN5168". 
This repository finally closes the last gap: it allows you to run a virtual MetaBrain together with your old physical NEEO Brain, making this combination  100% compatible with the original NEEO-Brain and -remote.
## What can I do with this?
Simply stated, you have:
- a virtual MetaBrain as the Brains for your remote solution, running somewhere tucked away in a closet.
- Your trusty NEEO-remote is where it is norm,ally: on the table, close by. 
- Your NEEO-Brain placed somewhere centrally so it can sdend infrard signals to the devices you want to control.
And this simply controlls your entire entertainment system, lights, AC and whatever you like.  
## What do I need
1 Running MetaBrain
2 NEEO Brain
3 NEEO Remote

You need to have access to the command line of the NEEO BRain as you're going to shutdown nearly all of the older NEEO-software and replacing them by this repository.  
## Functionality
- This bridge needs to know the name of the brain. You have to make a file named BRAINNAME.json in /steady/neeo/cp6 with this JSON-content:
{
    "advertisedName": "NEEOBETA"
}
Where NEEOBETA needs to be the name of your docker Brain.
That's where I'm working on now, now that the solution itself is working 100%.
I'll be releasing scripts to disable all NEEO-software that is no longer required and a script to install this new solution. Don;t worry, I will not remove the old software, hell, I'll even provide a script to re-activate your old NEEO brain if you do not like this solution.
## Benefits
No need for Broadlink infrared transmitters anymore; your old NEEO-Brain will happily step in.
New remotes (or old ones, if needed) can be paired with your virtual brain again.
The physical NEEO eco-system is complete again: Brain and remote can find a place within your household (again).
No extra hardware required. 

## Installation
Unfortunately, the OS and software on the NEEO brain is very outdated.
That means that it is rather difficult to get information from the internet using tools like wget or curl. 
I tried upgrading the software, but that resulted in a damaged, non-bootable Brain constantly.

This leaves "manual installation" as the only viable option. Below I'll outline the steps, then I'll zoom in into every step.

## Installation overview
1 Mount filesystem rewritable
2 Add BrainBridge.js
3 Define name of Docker Brain
4 Stop all NEEO Application-processes
5 Stop META (if running)
6 Create BrainBridge service
7 Finish installation by making filesystem readonly

## Installation steps
Assuming you know how to login to the system via ssh, you have to execute the following steps from 1 to 6 by executing the command in it.

### 1 Mount filesystem rewritable
sudo mount -o remount,rw /dev/mmcblk0p2 /

### 2 Add BrainBridge.js
Copy the file BrainBridge.js from this repository (tip: open the file in github.com, then select "Raw" and do a control-A and control-C)
sudo nano /opt/BrainBridge.js
paste the entire source into the nano editor (using control-V, Command-V on MacOs)
save the file with control-x, confirm saving the file

### 3 Define name of Docker Brain

The bridge needs to know the name of the brain. 
You have to create a file named BRAINNAME.json in /steady/neeo/cp6 with this JSON-content:
{
    "advertisedName": "NEEOBETA"
}
Obviously, you must fill in the name of your Docker Brain in-stead of NEEOBETA

### 4 Stop all NEEO Application-processes
Give this command (completely copy it)
sudo systemctl stop neeo-pm2
sudo systemctl stop neeo-pm2

### 5 Stop META (if running)
sudo systemctl stop pm2-neeo

### 6 Create BrainBridge service
sudo nano /usr/lib/systemd/system/NEEO-ipbridge-to-docker.service
copy and paste the content of servicedefinition.txt
save (control-x and confirm)
sudo systemctl daemon-reload
sudo systemctl enable NEEO-ipbridge-to-docker
sudo systemctl start NEEO-ipbridge-to-docker

You can check progress by using the journalcntl -f 
This will write all messages from both the border-router as well the BrainBridge
sudo systemctl status NEEO-ipbridge-to-docker will show you the status/healthiness of the bridge. This shouldlook like this:
``` 
* [neeo@NEEO-a1684a36 opt]$ sudo systemctl status NEEO-ipbridge-to-docker
* NEEO-ipbridge-to-docker.service - NEEO-ipbridge-to-docker
   Loaded: loaded (/usr/lib/systemd/system/NEEO-ipbridge-to-docker.service; enabled; vendor preset: disabled)
   Active: active (running) since Mon 2026-06-01 17:52:34 UTC; 48min ago
 Main PID: 6784 (node)
   Memory: 7.0M
   CGroup: /system.slice/NEEO-ipbridge-to-docker.service
           |-6784 /usr/bin/node /opt/BrainBridge.js
           `-6795 avahi-publish -s NEEOBETA-jn5168 _http._tcp 8088 ip=192.168.73.95

Jun 01 17:52:35 NEEO-a1684a36 node[6784]: 2026-06-01 17:52:35.333 HTTP Bridge active: Listening on TCP port 8080 for Docker requests
Jun 01 17:52:35 NEEO-a1684a36 node[6784]: 2026-06-01 17:52:35.346 /var/opt/neeo/nbr-rest.json loaded initially {"nbr_web_server":"[fda1:684a:36ca::215:8d00:cd:9c38]"}
Jun 01 17:53:02 NEEO-a1684a36 node[6784]: 2026-06-01 17:53:02.282 /var/opt/neeo/nbr-rest.json changed from "[fda1:684a:36ca::215:8d00:cd:9c38]" to {"nbr_web_server":"[fda1:6>
Jun 01 17:53:45 NEEO-a1684a36 node[6784]: 2026-06-01 17:53:45.770 [DYNAMIC IP] Docker Brain detected at IP address: 192.168.73.111
Jun 01 17:53:45 NEEO-a1684a36 node[6784]: 2026-06-01 17:53:45.771 [HTTP IN] HTTP POST received from 192.168.73.111: POST /encryption
Jun 01 17:53:46 NEEO-a1684a36 node[6784]: 2026-06-01 17:53:46.644 [HTTP IN] HTTP POST received from 192.168.73.111: GET /neighbors
Jun 01 17:53:50 NEEO-a1684a36 node[6784]: 2026-06-01 17:53:50.293 [HTTP OUT] Sending: GET http://192.168.73.111:3000/v1/api/TouchButton
Jun 01 17:53:50 NEEO-a1684a36 node[6784]: 2026-06-01 17:53:50.348 [HTTP OUT] Response status: 200
Jun 01 17:53:50 NEEO-a1684a36 node[6784]: 2026-06-01 17:53:50.369 [HTTP IN] HTTP POST received from 192.168.73.111: POST /discovery
Jun 01 17:54:16 NEEO-a1684a36 node[6784]: 2026-06-01 17:54:16.671 [HTTP IN] HTTP POST received from 192.168.73.111: POST /blink
```
** Active: active (running) since Mon 2026-06-01 17:52:34 UTC; 48min ago * shows that our node is running **


### 7 Finish installation by making filesystem readonly
sudo mount -o remount,rw /dev/mmcblk0p2 /


If this does not work, wait patiently for 15 minutes or so and try again. If it still does not work, check what process is blocking:
sudo fuser -vm /
This should show you the offending process. Try to stop that process nicely (kill the pid), if not possibly, issue sudo fuser -k -m /
Then issue again:
sudo mount -o remount,rw /dev/mmcblk0p2 / 

DO NOT FORGET THIS LAST STEP!!!!!!
If your Brain freezes for some reason, the root filesystem will not be closed nicely, and a restart may not be possible anymore.
