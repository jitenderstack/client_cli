#!/usr/bin/env node

const { program } = require('commander');


require("./commander/updateVersion")(program)


// Parse the command-line arguments
program.parse(process.argv);
