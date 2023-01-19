import express, {Request, Response, Router} from 'express';
import Reply from "../classes/reply/Reply";
import osUtils from 'node-os-utils';
import {exec} from "child_process";
import rateLimit from 'express-rate-limit'

const router: Router = express.Router();

let messages = [
    "Behold, the vitals!",
    "Use your EYEs to look at these Eye vitals!!",
    "I'm not a doctor, but I can tell you that these vitals are healthy! - GitHub Copilot",
    "Viiiiiiiiiiiiiiitaaaaaaaaaaaaaallllllllllllssssssssssssssssss",
    "Knock knock. Who's there? Vitals!",
    "Well the server responded, so that's good right?",
    "Behold, signals of being alive!",
    "Behold, dog! - Some Elden Ring player, probably",
    "Hidden path ahead - Some Elden Ring player, probably",
    "snake, Try stealth - Some Elden Ring player, probably",
    "fort, night - Some Elden Ring player, probably",
    "I think there are too many Elden Ring message jokes in these vitals message options",
    "Vital information",
    "It's alive!",
    "Still alive",
    "Wow it sure is hot in here",
    "Why did the fan just ramp up?",
    "I'm too young to drink vitals! - Niko, probably",
    "I love vitals. In fact, I have so much of it that I started this API just to tell everyone about it. - Probably not Niko"
]

const limiter = rateLimit({
    windowMs: 60 * 1000, // 15 minutes
    max: 15, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
})

router.use(limiter);

router.get("/fortune", (req: Request, res: Response) => {
    res.send(messages[Math.floor(Math.random() * messages.length)])
})

router.get("/", async (req: Request, res: Response) => {
    res.json(new Reply(200, true, {message: messages[Math.floor(Math.random() * messages.length)], data: {
        memory: await getMemoryInfo(),
        cpu: await getCpuInfo(),
        gpu: await getGpuInfo(),
        storage: await getStorageInfo(),
        misc: await getMiscInfo()
    }}));
})

router.get("/cpu", async (req: Request, res: Response) => {
    res.json(new Reply(200, true, {message: "Behold! Data!", data: await getCpuInfo()}))
})

router.get("/storage", async (req: Request, res: Response) => {
    res.json(new Reply(200, true, {message: "Behold! Data!", data: await getStorageInfo() }))
})

router.get("/memory", async (req: Request, res: Response) => {
    res.json(new Reply(200, true, {message: "Behold! Data!", data: await getMemoryInfo() }))
})

router.get("/misc", async (req: Request, res: Response) => {
    res.json(new Reply(200, true, {message: "Behold! Data!", data: await getMiscInfo() }))
})

router.get("/gpu", async (req: Request, res: Response) => {
    res.json(new Reply(200, true, {message: "Behold! Data!", data: await getGpuInfo() }))
})

/**
 * Get the memory info
 */
async function getMemoryInfo() {
    return await osUtils.mem.info();
}

/**
 * Get the CPU info
 */
async function getCpuInfo() {
    return {
        usage: await osUtils.cpu.usage(),
        usageUnit: "%",
        load:  {
            minute_1: osUtils.cpu.loadavgTime(1),
            minute_5: osUtils.cpu.loadavgTime(5),
            minute_15: osUtils.cpu.loadavgTime(15)
        },
        temp: await getCpuTemp()
    }
}

/**
 * Get the storage info
 */
async function getStorageInfo() {
    return { dataDrive: await osUtils.drive.info("/share"), systemDrive: await osUtils.drive.info("/") }
}

async function getMiscInfo() {
    return {
        uptime: osUtils.os.uptime(),
        hostname: osUtils.os.hostname(),
        platform: await osUtils.os.platform(),
        arch: osUtils.os.arch(),
        oos: await osUtils.os.oos(),
        netstat: {
            inout: (await osUtils.netstat.inOut())["total"],
            stats: (await osUtils.netstat.stats())?.find(i => i.interface == "enp2s0")
        },
        openFiles: await osUtils.openfiles.openFd(),
    }
}

async function getCpuTemp() {
    return new Promise((resolve) => {
        exec("sensors -j", (error, stdout) => {
            if (error) {
                console.error(error);
                return resolve(0);
            }
            try {
                let jsonTempInfo = JSON.parse(stdout)
                return resolve(jsonTempInfo["coretemp-isa-0000"]["Package id 0"]["temp1_input"])
            } catch (e) {
                console.error(e);
                return resolve(0);
            }
        })
    })

}

/**
 * Get GPU info from nvidia-smi, convert xml to json with xq
 * @returns {Promise<any>}
 */
async function getGpuInfo() {
    return new Promise((resolve) => {
        exec("nvidia-smi -x -q | xq .", (error, stdout) => {
            if (error) {
                console.error(error);
                return resolve(0);
            }
            try {
                let gpuJson = JSON.parse(stdout)
                return resolve({
                    name: gpuJson["nvidia_smi_log"]["gpu"]["product_name"],
                    temp: gpuJson["nvidia_smi_log"]["gpu"]["temperature"]["gpu_temp"],
                    power: gpuJson["nvidia_smi_log"]["gpu"]["power_readings"]["power_draw"],
                    powerUnit: "W",
                    memory: gpuJson["nvidia_smi_log"]["gpu"]["fb_memory_usage"],
                    utilization: gpuJson["nvidia_smi_log"]["gpu"]["utilization"],
                    coreClock: gpuJson["nvidia_smi_log"]["gpu"]["clocks"]["graphics_clock"],
                    memoryClock: gpuJson["nvidia_smi_log"]["gpu"]["clocks"]["mem_clock"]
                })
            } catch (e) {
                console.error(e);
                return resolve(0);
            }
        })
    })
}

export default router;