#!/usr/bin/env node
import { WikiCli } from "./Cli.js"

process.exitCode = await new WikiCli().run(process.argv.slice(2))
