import express, {Request, Response, Router} from 'express';
import {Auth, WsAuth} from './auth';
import {exec} from "child_process";
import ServerErrorReply from "../classes/reply/ServerErrorReply";
import Reply from "../classes/reply/Reply";
import InvalidReplyMessage from "../classes/reply/InvalidReplyMessage";
import fs from 'fs';
import { Application } from "../classes/Application";
import Deployment from "../classes/Deployment";
import NotFoundReply from "../classes/reply/NotFoundReply";
import {RouterLike} from "express-ws";
import {getEws} from "../index";
import { request } from 'http';

/**
 * Find and read all app definitions in /litdevs/ems-internal/app-definitions
 * Create Application objects, the constructor will throw an error if the input is not a valid definition.
 */
let processes : Application[] = [];

if (!fs.existsSync("/litdevs/ems-internal/app-definitions")) {
    fs.mkdirSync("/litdevs/ems-internal/app-definitions", {recursive: true});
    fs.mkdirSync("/litdevs/ems-internal/logs", {recursive: true});
}

let definitions = fs.readdirSync("/litdevs/ems-internal/app-definitions")

definitions.forEach(async definition => {
    fs.readFile(`/litdevs/ems-internal/app-definitions/${definition}`, (err, fileContents) => {
        if (err) return console.error(err);
        let appDefinition : Application;
        try {
            appDefinition = new Application(JSON.parse(fileContents.toString()));
        } catch (e) {
            return console.error(e)
        }
        processes.push(appDefinition);
    });
})

const router: any = express.Router();

router.get("/processes", Auth, (req: Request, res: Response) => {
    // Strip out env from processes and respond with array of processes.
    let safeProcesses : Application[] = [];
    processes.forEach(process => {
        safeProcesses.push({...process, env: []})
    })
    res.json(new Reply(200, true, {message: "Here are the pm2 processes running in EMS", data: safeProcesses}));
})

router.post("/deploy", Auth, async (req: Request, res: Response) => {
    let appDef : Application;
    try {
        appDef = new Application(req.body);
    } catch (e : any) {
        // If the definition isn't valid, the constructor throws an error.
        return res.status(400).json(new InvalidReplyMessage(`Invalid app definition: ${e}`));
    }
    let deploymentType : "git" | "local" | undefined = req.body.deployType;
    let deploymentPath : string | undefined = req.body.deployPath;
    if (!deploymentType || !["git", "local"].includes(deploymentType)) return res.status(400).json(new InvalidReplyMessage("Invalid deployment type"));
    if (!deploymentPath) return res.status(400).json(new InvalidReplyMessage("Invalid deployment path. For git provide a git url, for local provide a folder in /litdevs/projects/"));
    broadcastDeploy({ name: appDef.name, message: "Deployment started", event: "deploy_start" })
    let deployment = new Deployment(appDef, deploymentType, deploymentPath);

    try {
        broadcastDeploy({ name: appDef.name, message: "Checking for existing deployment", event: "deploy_existing_check_start" })
        await deployment.checkExisting();
        broadcastDeploy({ name: appDef.name, message: "No existing deployment found", event: "deploy_existing_check_end" })
        broadcastDeploy({ name: appDef.name, message: "Obtaining project files", event: "deploy_file_get_start" })
        await deployment.getFiles();
        broadcastDeploy({ name: appDef.name, message: "Project files obtained", event: "deploy_file_get_end" })
        broadcastDeploy({ name: appDef.name, message: "Ensuring project is a git repository", event: "deploy_git_check_start" })
        await deployment.ensureGitRepo();
        broadcastDeploy({ name: appDef.name, message: "Project is a git repository", event: "deploy_git_check_end" })
        broadcastDeploy({ name: appDef.name, message: "Creating .env file", event: "deploy_env_file_start" })
        await deployment.createEnv();
        broadcastDeploy({ name: appDef.name, message: ".env file created", event: "deploy_env_file_end" })
        broadcastDeploy({ name: appDef.name, message: `Installing dependencies with ${appDef.pacman}`, event: "deploy_dependency_install_start" })
        await deployment.installDependencies();
        broadcastDeploy({ name: appDef.name, message: "Dependencies installed", event: "deploy_dependency_install_end" })
        broadcastDeploy({ name: appDef.name, message: "Launching with pm2", event: "deploy_pm2_start" })
        await deployment.pm2();
        broadcastDeploy({ name: appDef.name, message: "Application launched", event: "deploy_pm2_end" })
        broadcastDeploy({ name: appDef.name, message: "Writing application definition to file", event: "deploy_save_definition_start" })
        await deployment.writeDefinitionToFile();
        processes.push(deployment.app);
        broadcastDeploy({ name: appDef.name, message: "Application definition saved.", event: "deploy_save_definition_end" })
        broadcastDeploy({ name: appDef.name, message: "Deployment successful.", event: "deploy_complete" })
        return res.json(new Reply(200, true, { message: "Deployment successful", appName: deployment.app.name }))
        // DNS, Nginx should be different endpoints
    } catch (e : any) {
        //deployment.cleanupFiles();
        if (!e.stack && e.startsWith("ERR_USER_FAULT")) {
            broadcastDeploy({ name: appDef.name, message: e, event: "deploy_error" })
            return res.status(400).json(new InvalidReplyMessage(e.split(":")[1]))
        }
        console.error(e);
        let logName = `/litdevs/ems-internal/logs/${new Date().toString().replace(/ /gm, "-").replace(/[^a-zA-Z0-9-]/gm, "")}.log`
        broadcastDeploy({ name: appDef.name, message: `Internal Server Error :(\nWriting log file at /litdevs/ems-internal/logs/${logName}`, event: "deploy_error" })
        fs.writeFileSync(logName, `${e.stack}`);
        return res.status(500).json(new ServerErrorReply())
    }
})

router.post("/remove", Auth, async (req: Request, res: Response) => {
    if (!req.body.appName) return res.status(400).json(new InvalidReplyMessage("Missing payload"));
    if (!processes.some(process => process.name === req.body.appName)) return res.status(404).json(new NotFoundReply("No such process"));
    broadcastDeploy({ name: req.body.appName, message: `Starting removal`, event: "remove_start" })
    processes.splice(processes.findIndex(item => item.name === req.body.appName), 1)
    fs.unlinkSync(`/litdevs/ems-internal/app-definitions/${req.body.appName}.json`);
    fs.rmSync(`/litdevs/projects/${req.body.appName}`, {recursive: true, force: true});
    exec(`pm2 delete ${req.body.appName}`, (error) => {
        if (error) {
            console.error(error);
            return res.status(500).json(new ServerErrorReply());
        }
        exec("pm2 save", (error) => {
            if (error) {
                console.error(error);
                return res.status(500).json(new ServerErrorReply());
            }
            broadcastDeploy({ name: req.body.appName, message: `Removal complete`, event: "remove_end" })
            return res.json(new Reply(200, true, { message: `${req.body.appName} removed.` }));
        })
    })
})

router.ws("/socket", (ws, req) => {
    WsAuth(req.headers["sec-websocket-protocol"]).then(allow => {
        if (!allow) return ws.close(3000, "Unauthorized");
        ws.on('message', msg => {
            if (msg === "ping") return ws.send("pong");
            ws.send("This websocket is read-only.")
        })
    })
})

router.post("/socket/broadcast", Auth, (req: Request, res: Response) => {
    if (!req.body.message) return res.status(400).json(new InvalidReplyMessage("Missing payload"));
    broadcastDeploy(req.body.message);
    res.json(new Reply(200, true, { message: "Message sent" }));
})

router.post("/status", Auth, (req: Request, res: Response) => {
    if (!req.body.appName) return res.status(400).json(new InvalidReplyMessage("Missing payload"));
    exec("pm2 jlist", (error, stdout) => {
        if (error) {
            console.error(error);
            return res.status(500).json(new ServerErrorReply());
        }
        try {
            let json = JSON.parse(stdout);
            let app = json.find((item: any) => item.name === req.body.appName);
            if (!app) return res.status(404).json(new NotFoundReply("No such process"));
            return res.json(new Reply(200, true, { message: "Here is the information about the process", data: app }));
        } catch {
            return res.status(500).json(new ServerErrorReply());
        }
    })
})

router.patch("/status", Auth, (req: Request, res: Response) => {
    if (!req.body.appName || !req.body.status) return res.status(400).json(new InvalidReplyMessage("Missing payload"));
    if (!processes.some(process => process.name === req.body.appName)) return res.status(404).json(new NotFoundReply("No such process"));
    let command
    if (req.body.status) command = `pm2 start ${req.body.appName}`;
    else command = `pm2 stop ${req.body.appName}`;
    exec(command, (error) => {
        if (error) {
            console.error(error);
            return res.status(500).json(new ServerErrorReply());
        }
        return res.json(new Reply(200, true, { message: "Status changed" }));
    })
})

export function broadcastDeploy(message : object) {
    let ews = getEws();
    // @ts-ignore | Took it from the docs, it works, but the type definition doesn't know it takes an optional argument.
    let clients = ews.getWss('/v1/pm2/socket').clients
    clients.forEach(client => {
        client.send(JSON.stringify(message));
    })
}

export default router;

export function getProcesses() {
    return processes;
}