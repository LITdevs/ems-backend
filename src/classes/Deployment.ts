import {Application} from "./Application";
import fs from "fs";
import { exec } from "child_process";
import {broadcastDeploy, getProcesses} from "../routes/pm2";

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
                broadcastDeploy({ name: this.app.name, message: "Cloning repository from git", event: "deploy_file_get_update" })
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
                broadcastDeploy({ name: this.app.name, message: "Moving files to project folder", event: "deploy_file_get_update" })
                // Move local files to new folder with known name, ensure the specified folder actually does exist
                let expectedPath = this.path;

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
                broadcastDeploy({ name: this.app.name, message: `Adding entry for ${envEntry.key}`, event: "deploy_env_file_update" })
                envContent += `${envEntry.key}=${envEntry.value}\n`;
                if (i === this.app.env.length) {
                    fs.writeFileSync(`${this.path}/.env`, envContent)
                    resolve();
                }
            })
        })
    }

    installDependencies() {
        return new Promise<void>((resolve, reject) => {
            // Install node dependencies
            let installCommand
            if (this.app.pacman !== "pip") installCommand = `${this.app.pacman} install`
            else installCommand = `${this.app.pacman} install -r requirements.txt`

            exec(installCommand, { cwd: this.path }, (err : any) => {
                if (err) {
                    console.error(err);
                    return reject(err);
                }
                resolve();
            })
        })
    }

    checkExisting() {
        // Check for existing deployment
        // PM2, Working directory, definition
        return new Promise<void>((resolve, reject) => {
            // Check ems definitions
            let activeDeployments = getProcesses();
            const foundDeployment = activeDeployments.some(deployment => deployment.name === this.app.name);
            if (foundDeployment) return reject("ERR_USER_FAULT:An existing deployment in EMS found.");

            // Check for existing working directory, only do this for git though
            if (this.type === "git") {
                let possiblePath = `/litdevs/projects/${this.app.name}`
                if (fs.existsSync(possiblePath)) return reject("ERR_USER_FAULT:An existing deployment folder found.");
            }

            // Check PM2 for running instance
            exec("pm2 jlist", (error, stdout) => {
                if (error) return reject(error); // error is logged in router
                let pm2List = JSON.parse(stdout);
                const foundDeployment = pm2List.some(deployment => deployment.name === this.app.name);
                if (foundDeployment) return reject("ERR_USER_FAULT:An existing deployment in PM2 found.")
                resolve();
            })
        })
    }

    pm2() {
        return new Promise<void>((resolve, reject) => {
            let deploymentCommand = `pm2 start "${this.app.runCommand}" ${this.app.pacman === "pip" ? '--interpreter python3 ' : ""}--name ${this.app.name}`;
            exec(deploymentCommand, { cwd: this.path }, (error, stdout) => {
                if (error) return reject(error);
                exec("pm2 save", (error) => {
                    if (error) return reject(error);
                    resolve();
                })
            })
        })
    }

    writeDefinitionToFile() {
        return new Promise<void>((resolve, reject) => {
            fs.writeFileSync(`/litdevs/ems-internal/app-definitions/${this.app.name}.json`, JSON.stringify(this.app, null, 4));
            resolve();
        })
    }
}