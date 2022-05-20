'use strict';

require('dotenv').config();
const port = process.env.PORT || 3000
const express = require('express')
const app = express()

const {
    db,
    usingFlyRegion,
    usingPrimaryRegion,
    usingDatabaseHost
} = require('./database');  // database.js

app.disable('x-powered-by');

app.get('/', (req, res) => {
    res.send('hello world')
})

app.get('/read', (req, res, next) => {
    var startTime = new Date().getTime();

    db.query('SELECT * FROM fruits ORDER BY id DESC LIMIT 3', function (err, rows) {
        if (err) {
            return next(err);
        }

        // show what's going on:
        res.json({
            time:  new Date().getTime() - startTime, // how long the query took (ms)
            usingFlyRegion: usingFlyRegion, // e.g "lhr"
            usingPrimaryRegion: usingPrimaryRegion, // e.g true
            usingDatabaseHost: usingDatabaseHost, // e.g "eu-west-3.psdb.cloud"
            data: rows
        })
    })
})

app.get('/write', (req, res, next) => {
    // pick a random fruit to add :)
    var fruits = ["orange", "lemon", "blueberry", "blackberry", "grape"]
    var fruit = fruits[Math.floor(Math.random()*fruits.length)];

    var startTime = new Date().getTime();

    db.query('INSERT INTO fruits SET ?', {
        name: fruit
    }, function (err, rows) {
        if (err) {
            return next(err);
        }

        // show what's going on:
        res.json({
            time:  new Date().getTime() - startTime, // how long the query took (ms)
            usingFlyRegion: usingFlyRegion, // e.g "lhr"
            usingPrimaryRegion: usingPrimaryRegion, // e.g true
            usingDatabaseHost: usingDatabaseHost, // e.g "eu-west-3.psdb.cloud"
            data: "Added a row with ID " + rows.insertId
        })
    });
})

/**
 * Custom error handler, primarily to catch failed writes to a read-only replica
 */
app.use((err, req, res, next) => {

    // was this error as a result of writing to a read-replica? Look for the result of that
    // e.g "supported only for primary tablet type, current type: rdonly".
    if (typeof err.sqlMessage === "string" && err.sqlMessage.includes("current type: rdonly")) {
        console.log(`Replaying this attempt to write to a read replica (from Fly region: ${process.env.FLY_REGION}) in the primary Fly region: ${process.env.PRIMARY_REGION}`);
        res.header('fly-replay', 'region='  + process.env.PRIMARY_REGION)
        return res.status(409).send("Replaying request in " + process.env.PRIMARY_REGION)
    }

    // something else went wrong
    console.error(err.stack)
    res.status(500).send('Something went wrong')
})

app.listen(port, '::', () =>
    console.log(`Listening on port ${port}`)
)