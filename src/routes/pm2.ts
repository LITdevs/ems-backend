import express, {Request, Response, Router} from 'express';
import { Auth } from './auth';
import {exec} from "child_process";
import ServerErrorReply from "../classes/reply/ServerErrorReply";
import Reply from "../classes/reply/Reply";
import InvalidReplyMessage from "../classes/reply/InvalidReplyMessage";
import fs from 'fs';
import { Application } from "../classes/Application";
import Deployment from "../classes/Deployment";

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
    console.log(definition)
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

const router: Router = express.Router();

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

    let deployment = new Deployment(appDef, deploymentType, deploymentPath);

    try {
        await deployment.getFiles();
        await deployment.ensureGitRepo();
        await deployment.createEnv();
        await deployment.installDependencies();
        await deployment.pm2();
        await deployment.writeDefinitionToFile();
        // DNS, Nginx should be different endpoints
    } catch (e : any) {
        //deployment.cleanupFiles();
        console.error(e);
        if (!e.stack && e.startsWith("ERR_USER_FAULT")) return res.status(400).json(new InvalidReplyMessage(e.split(":")[1]))
        fs.writeFileSync(`/litdevs/ems-internal/logs/${new Date().toString().replace(/ /gm, "-").replace(/[^a-zA-Z0-9-]/gm, "")}.log`,
            `${e.stack}`);
        return res.status(500).json(new ServerErrorReply())
    }
})

export default router;