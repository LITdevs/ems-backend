import express, {Request, Response, Router} from 'express';
import fs from "fs";
import SecretStore from "../classes/SecretStore";
import {Auth} from "./auth";
import Reply from "../classes/reply/Reply";
import NotFoundReply from "../classes/reply/NotFoundReply";
import InvalidReplyMessage from "../classes/reply/InvalidReplyMessage";
import ServerErrorReply from "../classes/reply/ServerErrorReply";

const router: Router = express.Router();

let store : SecretStore;
if (!fs.existsSync("/litdevs/ems-internal/secret-store.json")) {
    store = new SecretStore();
} else {
    store = new SecretStore(JSON.parse(fs.readFileSync("/litdevs/ems-internal/secret-store.json").toString()));
}

router.get("/get/:key", Auth, (req : Request, res : Response) => {
    let value = store.get(req.params.key);
    if (!value) return res.status(404).json(new NotFoundReply());
    res.json(new Reply(200, true, { message: "Here is your secret, have a nice day :)", data: value}))
})

router.get("/list", Auth, (req : Request, res : Response) => {
    let value = store.store
    res.json(new Reply(200, true, { message: "Here is the array of secrets, you will probably be coming back to decrypt them later", data: value}))
})

router.post("/set/:key", Auth, (req : Request, res : Response) => {
    if (!req.body.value) return res.status(400).json(new InvalidReplyMessage("Missing payload"));
    try {
        let value = store.set(req.params.key, req.body.value)
        res.json(new Reply(200, true, {message: "Secret saved.", data: value}))
    } catch (e) {
        console.error(e);
        res.status(500).json(new ServerErrorReply());
    }
})

router.delete("/delete/:key", Auth, (req : Request, res : Response) => {
    store.nuke(req.params.key);
    res.json(new Reply(200, true, {message: "Explosion initiated"}))
})

export default router;
