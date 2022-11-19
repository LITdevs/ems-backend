import express, {Request, Response, Router} from 'express';
import { Auth } from './auth';
import {exec} from "child_process";
import ServerErrorReply from "../classes/reply/ServerErrorReply";
import Reply from "../classes/reply/Reply";
import InvalidReplyMessage from "../classes/reply/InvalidReplyMessage";

const router: Router = express.Router();

router.get("/status", Auth, (req: Request, res: Response) => {
    let minecraftStatusCommand = 'systemctl show atm7 | grep "StateChangeTimestamp\\|SubState\\|ActiveState"'
    // noinspection JSUnusedLocalSymbols
    exec(minecraftStatusCommand, (error, stdout, stderr) => {
        if (error) return res.status(500).json(new ServerErrorReply());
        let sysdOut = stdout.split("\n");
        let ActiveState = sysdOut[0].split("=")[1]
        let SubState = sysdOut[1].split("=")[1]
        let StateChangeTimeStamp = sysdOut[2].split("=")[1]

        let replyObj = {
            ActiveState,
            SubState,
            StateChangeTimeStamp
        }

        return res.json(new Reply(200, true, { message: "Here is the status of the Minecraft server.", data: replyObj}))
    })
})

router.patch("/status", Auth, (req: Request, res: Response) => {
    let desiredState = req?.body?.status;
    let force = req?.body?.force;
    if (typeof desiredState === "undefined") return res.json(new InvalidReplyMessage("Request missing payload"));
    if (typeof desiredState !== "boolean") return res.json(new InvalidReplyMessage("Invalid payload"));
    if (force && typeof force !== "boolean") return res.json(new InvalidReplyMessage("Invalid payload"));

    let statusChangeCommand
    if (desiredState) statusChangeCommand = "sudo systemctl start atm7.service"; // Start server in screen with sockname atm
    if (!desiredState) statusChangeCommand = "sudo screen -S atm -p 0 -X stuff \"stop^M\""; // Sends stop command to the server console
    if (force) statusChangeCommand = "sudo systemctl stop atm7.service"; // Force stop server

    // noinspection JSUnusedLocalSymbols
    exec(statusChangeCommand, (error, stdout, stderr) => {
        if (error) return res.status(500).json(new ServerErrorReply());
        return res.json(new Reply(200, true, {message: `Server status change requested. ${!desiredState && !force 
                ? "Note that if the server is stuck, this action may not be effective. " +
                "If there is no change, use the force property in the payload." 
                : ""}`}))
    })
})

router.get("/icon", (req : Request, res: Response) => {
    res.sendFile("/litdevs/ems-internal/atm7.png")
})

export default router;