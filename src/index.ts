import express, {Request, Response} from 'express';
import db from "./db";
const app = express();
import dotenv from 'dotenv';
dotenv.config();

app.use(express.json());

import auth from './routes/auth';
app.use("/v1/auth", auth);

app.use("*", (req : Request, res : Response) => {
    res.status(403).end();
})

let port = process.env.EMS_API_PORT || 1337
db.dbEvents.on("ready", () => {
    app.listen(port, () => {
        console.info(`App listening on ${port}`);
    })
})
