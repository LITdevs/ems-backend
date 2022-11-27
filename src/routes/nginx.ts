import express, {Request, Response, Router} from 'express';
import {Auth} from "./auth";
import Reply from "../classes/reply/Reply";
import { getProcesses } from "./pm2";
import fs from "fs";
import InvalidReplyMessage from "../classes/reply/InvalidReplyMessage";
import NotFoundReply from "../classes/reply/NotFoundReply";
import {exec} from "child_process";

const router: Router = express.Router();

let domains = {}
if (fs.existsSync("/litdevs/ems-internal/domains.json")) {
    domains = JSON.parse(fs.readFileSync("/litdevs/ems-internal/domains.json").toString());
}

router.get("/list", Auth, (req: Request, res: Response) => {
    res.json(new Reply(200, true, {message: "Behold! A list!", data: domains}))
})

/**
 * Create/update a domain-app link
 * @param appName
 * @param domain
 */
router.post("/domain", Auth, (req: Request, res: Response) => {
    if (!req.body.appName || !req.body.domain) return res.status(400).json(new InvalidReplyMessage("Missing payload: appName or domain"));
    if (!getProcesses().some(process => process.name === req.body.appName)) return res.status(404).json(new NotFoundReply("No such app"));
    domains[req.body.appName] = req.body.domain;
    fs.writeFileSync("/litdevs/ems-internal/domains.json", JSON.stringify(domains, null, 4));
    writeCurrentConfig();
    res.json(new Reply(200, true, { message: "domain-app link created or updated" }))
})

/**
 * Get a domain-app link
 * @param appName
 */
router.get("/domain", Auth, (req: Request, res: Response) => {
    if (!req.query.appName) return res.status(400).json(new InvalidReplyMessage("Missing payload: appName"));
    if (!getProcesses().some(process => process.name === String(req.query.appName))) return res.status(404).json(new NotFoundReply("No such app"));
    if (!domains[String(req.query.appName)]) return res.status(404).json(new NotFoundReply("No such domain-app link"));
    writeCurrentConfig();
    res.json(new Reply(200, true, { message: "behold! domain-app link!", data: domains[String(req.query.appName)] }))
})

/**
 * Delete a domain-app link
 * @param appName
 */
router.delete("/domain", Auth, (req: Request, res: Response) => {
    if (!req.body.appName) return res.status(400).json(new InvalidReplyMessage("Missing payload: appName"));
    if (!getProcesses().some(process => process.name === req.body.appName)) return res.status(404).json(new NotFoundReply("No such app"));
    if (!domains[req.body.appName]) return res.status(404).json(new NotFoundReply("No such domain-app link"));
    domains[req.body.appName] = undefined;
    fs.writeFileSync("/litdevs/ems-internal/domains.json", JSON.stringify(domains, null, 4));
    writeCurrentConfig();
    res.json(new Reply(200, true, { message: "domain-app link deleted" }))
})

/**
 * Find current port in use by specified application
 * @param appName - Application
 * @param processes - processes object from pm2 router
 * @returns {number} - port number, or 0 if not a web app
 */
function findCurrentPort(appName, processes) {
    let process = processes.find(process => process.name === appName);
    if (process.defaultPort === 0) return 0; // Not a web app
    if (!process.portEnv) return process.defaultPort;
    let portEnv = process.env.find(env => env.key === process.portEnv);
    if (!portEnv) return process.defaultPort;
    return Number(portEnv.value);
}

/**
 * Generate nginx config from current processes list and custom rules
 */
function writeCurrentConfig() {
    let processes = getProcesses();
    let conf = "# PLEASE DO NOT EDIT. ANY CHANGES WILL BE OVERWRITTEN.\n# ADD CUSTOM RULES IN SEPARATE CONFIG FILES"
    processes.forEach(process => {
        if (!domains[process.name]) return;
        conf += `
server {
    listen 80;
    listen [::]:80;
    
    server_name ${domains[process.name]};
    
    location / {
      proxy_pass http://localhost:${findCurrentPort(process.name, processes)};
    }
}`
    })
    fs.writeFileSync("/etc/nginx/sites-enabled/ems.conf", conf)
    exec(`sudo systemctl reload nginx`, (err : any) => {
        if (err) console.error(err);
    })
}

export { writeCurrentConfig }
export default router;