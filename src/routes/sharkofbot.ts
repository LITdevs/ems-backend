import express, {Request, Response, Router} from 'express';
import { Auth } from './auth';
import {exec} from "child_process";
import ServerErrorReply from "../classes/reply/ServerErrorReply";
import Reply from "../classes/reply/Reply";
import InvalidReplyMessage from "../classes/reply/InvalidReplyMessage";

const router: Router = express.Router();

router.get("/funserver/status", Auth, (req: Request, res: Response) => {
    let minecraftStatusCommand = 'systemctl show funserver.service | grep "StateChangeTimestamp\\|SubState\\|ActiveState"'
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

        return res.json(new Reply(200, true, { message: "Here is the status of funserver.", data: replyObj}))
    })
})

router.patch("/funserver/status", Auth, (req: Request, res: Response) => {
    let desiredState = req?.body?.status;
    if (typeof desiredState === "undefined") return res.json(new InvalidReplyMessage("Request missing payload"));
    if (typeof desiredState !== "boolean") return res.json(new InvalidReplyMessage("Invalid payload"));

    let statusChangeCommand
    if (desiredState) statusChangeCommand = "sudo systemctl start funserver.service"; // Start server in screen with sockname atm
    if (!desiredState) statusChangeCommand = "sudo systemctl stop funserver.service"; // Sends stop command to the server console

    // noinspection JSUnusedLocalSymbols
    exec(statusChangeCommand, (error, stdout, stderr) => {
        if (error) return res.status(500).json(new ServerErrorReply());
        return res.json(new Reply(200, true, {message: `Server status change requested.`}))
    })
})

export default router;