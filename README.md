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
## How to install
That's where I'm working on now, now that the solution itself is working 100%.
I'll be releasing scripts to disable all NEEO-software that is no longer required and a script to install this new solution. Don;t worry, I will not remove the old software, hell, I'll even provide a script to re-activate your old NEEO brain if you do not like this solution.
## Benefits
No need for Broadlink infrared transmitters anymore; your old NEEO-Brain will happily step in.
New remotes (or old ones, if needed) can be paired with your virtual brain again.
The physical NEEO eco-system is complete again: Brain and remote can find a place within your household (again).
No extra hardware required. 
