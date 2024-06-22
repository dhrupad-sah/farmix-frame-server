const {config} = require("dotenv")
config();

const  { CovalentClient } = require("@covalenthq/client-sdk");

const client = new CovalentClient(`${process.env.COVALENT_API_KEY}`);

module.exports = { client };