import {Application} from "./Application";
import fs from "fs";
import { exec } from "child_process";

export default class Deployment {
    app : Application;
    type: "git" | "local";
    path: string;

    constructor(appDefinition : Application, deploymentType : "git" | "local", deploymentPath : string) {
        this.app = appDefinition;
        this.type = deploymentType;
        this.path = deploymentPath;
    }

    getFiles() {
        return new Promise<void>((resolve, reject) => {
            let newPath = `/litdevs/projects/${this.app.name}`
            if (this.type === "git") {
                // Clone repo from git, update path to known location
                exec(`git clone ${this.path} ${newPath}`, (err : any) => {
                    if (err) {
                        console.error(err);
                        if (err.stack.includes("not an empty directory")) return reject("ERR_USER_FAULT:Git clone failed, directory not empty. Has this project already been deployed?");
                        if (err.stack.includes("fatal:")) return reject("ERR_USER_FAULT:Git clone failed, likely invalid repo url.");
                        return reject("ERR_USER_FAULT:idk exec git clone returned error, probably a bug lmao");
                    }
                    this.path = newPath
                    resolve()
                });
            } else if (this.type === "local") {
                // Move local files to new folder with known name, ensure the specified folder actually does exist
                let expectedPath = `/litdevs/projects/${this.path}`

                let folderPresent = fs.existsSync(expectedPath);
                if (!folderPresent) throw "ERR_USER_FAULT:Project folder not found";
                fs.renameSync(expectedPath, newPath);
                this.path = newPath;
                resolve()
            } else {
                throw new Error("Invalid deployment type, it shouldn't be possible for this to occur... You have a bug somewhere, good luck :)")
            }
        })
    }

    ensureGitRepo() {
        return new Promise<void>((resolve, reject) => {
            // Will return an error if the specified path is not a git repository.
            exec(`git -C ${this.path} rev-parse --is-inside-work-tree`, (err : any) => {
                if (err) {
                    return reject("ERR_USER_FAULT:No git repository was found");
                }
                return resolve();
            })
        })
    }

    createEnv() {
        return new Promise<void>((resolve, reject) => {
            // Create .env file based on the env object of the app definition
            // KEY=VALUE\nKEY2=VALUE2
            let envContent : string = "";
            let i = 0;
            this.app.env.forEach(envEntry => {
                i++;
                envContent += `${envEntry.key}=${envEntry.value}\n`;
                if (i === this.app.env.length) {
                    fs.writeFileSync(`${this.path}/.env`, envContent)
                    resolve();
                }
            })
        })
    }
}